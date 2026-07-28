"""
Sync worker - the only component that talks to Firestore.

Plan reference: yard/docs/offline-sync-plan.md sections 4, 5 (PR 3) and 6.

The Flask request handlers read and write SQLite only. This worker runs on a
background thread and reconciles that local state with Firestore, which is what
lets the console keep working with no internet instead of failing at the door.

The ordering rule is the important part and it is not arbitrary: flush the
outbox BEFORE pulling. A local write records a physical event - the rover
actually moved across the yard. The Firestore copy is stale by definition,
because it never heard about that run. Pulling first would overwrite ground
truth with staleness and silently erase the fact that a mission ran.
"""

import json
import threading
from datetime import datetime, timezone

from mission_store import (
    clear_dirty,
    delete_outbox,
    log_conflict,
    mark_attempt,
    peek_outbox,
    upsert_missions,
)

# Higher wins. A mission only ever moves up this ladder, never back down, so
# most reconnect conflicts resolve themselves with no coordination.
_RANK = {'queued': 0, 'processing': 1, 'cancelled': 2, 'failed': 3, 'completed': 4}

_TERMINAL = ('completed', 'failed', 'cancelled')


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def should_local_win(local_payload, remote_data):
    """Merge rule from plan section 6: higher rank wins, later time breaks ties."""
    local_status = local_payload.get('status')
    remote_status = remote_data.get('status')

    # A non-status change (attaching a YouTube URL) has nothing to compare.
    if not local_status or not remote_status:
        return True

    local_rank = _RANK.get(local_status, -1)
    remote_rank = _RANK.get(remote_status, -1)

    if local_rank != remote_rank:
        return local_rank > remote_rank

    return local_payload.get('statusUpdatedAt', '') >= remote_data.get('statusUpdatedAt', '')


def _maybe_log_conflict(mission_id, local_payload, remote_data, local_won):
    """Record a merge only when the LOSING side was already terminal.

    Normal forward progression - queued losing to completed - is not a
    conflict. Logging it would bury the real ones in noise nobody reads.
    """
    local_status = local_payload.get('status')
    remote_status = remote_data.get('status')
    if not local_status or not remote_status:
        return

    loser = remote_status if local_won else local_status
    if loser in _TERMINAL:
        log_conflict(
            mission_id,
            local_state=local_status,
            remote_state=remote_status,
            resolution='local' if local_won else 'remote',
        )


def flush_one(firestore_client, entry, collection_name='missions'):
    """Apply one outbox entry to Firestore. Returns True only on confirmation.

    The merge rule is evaluated INSIDE the transaction, so a remote change that
    lands between the read and the write cannot be clobbered. Replaying an
    entry that already applied is safe: every operation is a state assignment
    rather than an increment, and the rule is re-evaluated rather than blindly
    overwriting.
    """
    from firebase_admin import firestore

    ref = firestore_client.collection(collection_name).document(entry['mission_id'])
    outcome = {}

    try:
        @firestore.transactional
        def _apply(transaction):
            snap = ref.get(transaction=transaction)
            remote = (snap.to_dict() or {}) if getattr(snap, 'exists', False) else {}
            local_payload = json.loads(entry['payload'])

            won = should_local_win(local_payload, remote)
            outcome['local_payload'] = local_payload
            outcome['remote'] = remote
            outcome['won'] = won

            if won:
                transaction.update(ref, local_payload)

        _apply(firestore_client.transaction())

        if outcome:
            _maybe_log_conflict(
                entry['mission_id'], outcome['local_payload'],
                outcome['remote'], outcome['won'],
            )

        # Only after Firestore confirms. Dropping the row first would lose the
        # write entirely if the commit had actually failed.
        delete_outbox(entry['seq'])
        # Release the mirror row once nothing else is queued for it, so pulls
        # can refresh it again. Without this, a mission touched offline once
        # stays frozen in the mirror forever.
        clear_dirty(entry['mission_id'])
        return True

    except Exception as e:
        mark_attempt(entry['seq'], str(e))
        return False


def sync_from_firestore(firestore_client, collection_name='missions'):
    """Pull missions into the mirror. Rows with pending local writes are
    protected by `local_dirty` inside upsert_missions."""
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
        return True
    except Exception as e:
        print(f'[sync] Failed to pull from Firestore: {e}')
        return False


def sync_cycle(firestore_client, collection_name='missions'):
    """One cycle: flush the outbox completely, and only then pull.

    A failed flush stops the whole cycle rather than skipping ahead. Entries
    apply in `seq` order because the Pi has no real-time clock, so its
    wall-clock timestamps cannot be trusted for ordering (plan 7.2).
    """
    while True:
        entry = peek_outbox()
        if entry is None:
            break
        if not flush_one(firestore_client, entry, collection_name):
            # Retry the same entry next cycle. Do NOT pull: the mirror would be
            # overwritten with a Firestore state that predates this entry.
            return False

    return sync_from_firestore(firestore_client, collection_name)


def start_sync_worker(client_factory, interval=30):
    """Poll on a background timer.

    Takes a FACTORY, not a client: a satellite that boots with no internet
    cannot build a Firestore client yet, and refusing to start here would mean
    it never syncs even once the network returns. The factory is retried every
    cycle instead.

    Mirrors start_polling's shape - the body can never kill the loop, so one
    bad cycle does not stop syncing forever.
    """
    def _loop():
        try:
            client = client_factory() if callable(client_factory) else client_factory
            sync_cycle(client)
        except Exception as e:
            print(f'[sync] Unexpected error: {e}')

        timer = threading.Timer(interval, _loop)
        timer.daemon = True
        timer.start()

    _loop()
