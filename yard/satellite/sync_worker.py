import threading
from datetime import datetime, timezone

from mission_store import upsert_missions


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
            sync_from_firestore(firestore_client)
        except Exception as e:
            print(f'[sync] Unexpected error: {e}')

        timer = threading.Timer(interval, _loop)
        timer.daemon = True
        timer.start()

    _loop()
