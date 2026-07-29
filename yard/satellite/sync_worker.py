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
import os
import threading
from datetime import datetime, timezone

from mission_store import (
    clear_dirty,
    delete_outbox,
    get_meta,
    log_conflict,
    mark_attempt,
    active_mission_ids,
    forget_mission,
    newest_submitted_at,
    peek_outbox,
    set_meta,
    upsert_missions,
)

# Read-cost budget. Firestore's free tier allows 50,000 document reads a day,
# shared with every learner loading the public feed.
#
# The naive version of this worker pulled 200 documents every 30 seconds:
#
#     2,880 cycles/day x 200 docs = 576,000 reads/day
#
# which is 11x the entire daily quota, from one satellite, before a single
# learner opens the site. What follows keeps the same 30-second freshness at
# roughly 1/100th of the cost:
#
#   - Incremental pull. New missions only, via submittedAt > cursor. A quiet
#     cycle reads nothing (an empty query result is billed as one read), so the
#     floor is ~2,880 reads/day.
#   - Active reconcile. Missions can also change remotely (mission-control
#     PATCH, the YouTube poll), and an incremental-by-submittedAt query cannot
#     see that. So every RECONCILE_EVERY cycles, re-read only the missions that
#     can still change - queued and processing. Terminal missions are not
#     re-read, because they do not move.
#   - A bounded first pull seeds an empty mirror.

FIRST_PULL_LIMIT = 200
INCREMENTAL_LIMIT = 100

# Every Nth cycle re-reads the missions that are still unfinished. At the
# default 30s interval that is every 5 minutes, well inside the time it takes
# an operator to notice anything.
#
# Both are tunable without a code change, because the right trade-off differs
# by day: during an event, freshness matters and there is an operator watching;
# on a quiet day the same settings just burn quota for nobody. Roughly:
#
#   SYNC_INTERVAL=30,  SYNC_RECONCILE_EVERY=10  ->  ~10,000 reads/day
#   SYNC_INTERVAL=60,  SYNC_RECONCILE_EVERY=10  ->  ~5,000 reads/day
#   SYNC_INTERVAL=120, SYNC_RECONCILE_EVERY=5   ->  ~4,000 reads/day
RECONCILE_EVERY = int(os.environ.get('SYNC_RECONCILE_EVERY', 10))
DEFAULT_INTERVAL = int(os.environ.get('SYNC_INTERVAL', 30))
_CYCLE_KEY = 'sync_cycle_count'

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


def sync_from_firestore(firestore_client, collection_name='missions', yard_id=None):
    """Pull only what changed, rather than the whole collection every cycle.

    Returns True on success. Rows with pending local writes are protected by
    `local_dirty` inside upsert_missions.
    """
    try:
        col = firestore_client.collection(collection_name)
        cursor = newest_submitted_at()

        if cursor:
            # Incremental: missions submitted since the newest one we hold.
            query = (
                col.where('submittedAt', '>', cursor)
                .order_by('submittedAt')
                .limit(INCREMENTAL_LIMIT)
            )
        else:
            # Empty mirror (first boot, or the db was cleared): seed it.
            query = col.order_by('submittedAt', direction='DESCENDING').limit(FIRST_PULL_LIMIT)

        missions = []
        for doc in query.stream():
            data = doc.to_dict() or {}
            data['id'] = doc.id
            missions.append(data)

        if missions:
            upsert_missions(missions, _now_iso())
        else:
            # Nothing new, but the console still needs to know we reached
            # Firestore just now or it will report itself as stale.
            set_meta('last_synced_at', _now_iso())

        return True
    except Exception as e:
        print(f'[sync] Failed to pull from Firestore: {e}')
        return False


def reconcile_active(firestore_client, collection_name='missions', yard_id=None):
    """Re-read the missions the MIRROR still considers unfinished.

    An incremental pull keyed on submittedAt cannot see a mission whose status
    changed remotely - mission-control marking one complete, or the YouTube
    poll attaching a video.

    It reads the locally-active documents by id rather than querying Firestore
    for remotely-active ones, because the transition that matters most is a
    mission FINISHING elsewhere: once it does, it no longer matches an "active"
    filter, so a remote query would never return it and the mirror would keep
    showing it as queued forever.

    Cost is exactly one read per unfinished mission, which is tens of documents
    on a busy day rather than the whole collection.
    """
    try:
        ids = active_mission_ids(yard_id)
        if not ids:
            return True

        col = firestore_client.collection(collection_name)
        missions = []
        for mission_id in ids:
            snap = col.document(mission_id).get()
            if not getattr(snap, 'exists', False):
                # Deleted remotely. Nothing else prunes the mirror, so without
                # this the console shows a mission that no longer exists - and
                # an operator can still try to dispatch it. Free to do here:
                # the document was read either way. forget_mission refuses if
                # local writes are still queued for it.
                if forget_mission(mission_id):
                    print(f'[sync] {mission_id} no longer exists remotely; removed from the mirror')
                continue
            data = snap.to_dict() or {}
            data['id'] = mission_id
            missions.append(data)

        if missions:
            upsert_missions(missions, _now_iso())
        return True
    except Exception as e:
        print(f'[sync] Failed to reconcile active missions: {e}')
        return False


def sync_cycle(firestore_client, collection_name='missions', yard_id=None):
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

    ok = sync_from_firestore(firestore_client, collection_name, yard_id=yard_id)

    # Periodically re-read the missions that can still change remotely.
    count = int(get_meta(_CYCLE_KEY, '0') or 0) + 1
    set_meta(_CYCLE_KEY, str(count))
    if ok and count % RECONCILE_EVERY == 0:
        reconcile_active(firestore_client, collection_name, yard_id=yard_id)

    return ok


def start_sync_worker(client_factory, interval=None):
    """Poll on a background timer.

    Takes a FACTORY, not a client: a satellite that boots with no internet
    cannot build a Firestore client yet, and refusing to start here would mean
    it never syncs even once the network returns. The factory is retried every
    cycle instead.

    Mirrors start_polling's shape - the body can never kill the loop, so one
    bad cycle does not stop syncing forever.
    """
    interval = DEFAULT_INTERVAL if interval is None else interval

    def _loop():
        try:
            client = client_factory() if callable(client_factory) else client_factory
            try:
                from satellite_identity import yard_id as _yard_id
                yard = _yard_id()
            except Exception:
                yard = None
            sync_cycle(client, yard_id=yard)
        except Exception as e:
            print(f'[sync] Unexpected error: {e}')

        timer = threading.Timer(interval, _loop)
        timer.daemon = True
        timer.start()

    _loop()
