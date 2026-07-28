import json
import threading
from datetime import datetime, timezone

from mission_store import upsert_missions, peek_outbox, delete_outbox, mark_attempt


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def sync_from_firestore(firestore_client, collection_name='missions'):
    """Pull all missions from Firestore and upsert into the local mirror."""
    try:
        docs = (
            firestore_client.collection(collection_name)
            .order_by('submittedAt', direction='DESCENDING')
            .limit(200)
            .stream()
        )
        missions = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            missions.append(data)

        upsert_missions(missions, _now_iso())
        print(f'[sync] Pulled {len(missions)} missions from Firestore')
    except Exception as e:
        print(f'[sync] Failed to pull from Firestore: {e}')


def start_sync_worker(firestore_client, interval=30):
    """Poll Firestore every `interval` seconds. Same pattern as start_polling."""
    def _loop():
        try:
            sync_cycle(firestore_client)
        except Exception as e:
            print(f'[sync] Unexpected error: {e}')

        timer = threading.Timer(interval, _loop)
        timer.daemon = True
        timer.start()

    _loop()

def sync_cycle(firestore_client):
    """One sync cycle: push first, then pull."""
    # Step 1: Flush outbox (push)
    while True:
        entry = peek_outbox()
        if entry is None:
            break  # Outbox empty, move to pull

        success = flush_one(firestore_client, entry)
        if not success:
            return  # Stop the whole cycle. Retry next time. Don't skip ahead.

    # Step 2: Pull (only when outbox is empty)
    sync_from_firestore(firestore_client)


def flush_one(firestore_client, entry):
    """Apply one outbox entry to Firestore. Returns True on success."""
    from firebase_admin import firestore

    ref = firestore_client.collection('missions').document(entry['mission_id'])

    try:
        @firestore.transactional
        def _apply(transaction):
            snap = ref.get(transaction=transaction)
            remote = snap.to_dict() or {} if snap.exists else {}
            local_payload = json.loads(entry['payload'])

            # Apply merge rule: higher rank wins
            if not should_local_win(local_payload, remote):
                return  # Remote already ahead, skip

            transaction.update(ref, local_payload)

        _apply(firestore_client.transaction())
        delete_outbox(entry['seq'])  # Only delete AFTER Firestore confirms
        return True

    except Exception as e:
        mark_attempt(entry['seq'], str(e))
        return False

_RANK = {'queued': 0, 'processing': 1, 'cancelled': 2, 'failed': 3, 'completed': 4}

def should_local_win(local_payload, remote_data):
    """Returns True if the local change should overwrite remote."""
    local_status = local_payload.get('status')
    remote_status = remote_data.get('status')

    if not local_status or not remote_status:
        return True  # Non-status change (e.g., youtube URL) — apply it

    local_rank = _RANK.get(local_status, -1)
    remote_rank = _RANK.get(remote_status, -1)

    if local_rank > remote_rank:
        return True   # Local is further along
    if local_rank < remote_rank:
        return False  # Remote is further along, don't downgrade

    # Same rank: later timestamp wins
    local_time = local_payload.get('statusUpdatedAt', '')
    remote_time = remote_data.get('statusUpdatedAt', '')
    return local_time >= remote_time

