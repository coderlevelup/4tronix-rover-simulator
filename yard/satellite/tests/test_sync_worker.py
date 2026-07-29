"""
Sync worker tests - the offline reconciliation contract.

Plan reference: yard/docs/offline-sync-plan.md section 8. The plan calls
push-before-pull "the single most important behavioural test in the story",
because getting it backwards silently erases the fact that a mission ran.
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import mission_store  # noqa: E402
import sync_worker  # noqa: E402


# --- Fakes -----------------------------------------------------------------

class FakeSnap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data else None


class FakeDocRef:
    def __init__(self, store, doc_id, meter=None):
        self._store, self._id, self._meter = store, doc_id, meter

    def get(self, transaction=None):
        if self._meter is not None and transaction is None:
            self._meter['docs_read'] += 1
        return FakeSnap(self._store.get(self._id))


class FakeTransaction:
    def __init__(self, store):
        self._store = store

    def update(self, ref, fields):
        self._store.setdefault(ref._id, {}).update(fields)


class FakeStreamDoc:
    def __init__(self, doc_id, data):
        self.id, self._data = doc_id, data

    def to_dict(self):
        return dict(self._data)


class FakeQuery:
    """Supports the where/order_by/limit chain and counts documents read.

    Read counting is the point: the naive worker pulled 200 docs every 30s,
    which is 576,000 reads/day against a 50,000/day quota. Tests assert the
    cost, not just the behaviour.
    """

    def __init__(self, store, meter, rows=None):
        self._store = store
        self._meter = meter
        self._rows = list(store.items()) if rows is None else rows

    def where(self, field, op, value):
        def keep(item):
            v = item[1].get(field)
            if op == '==':
                return v == value
            if op == '>':
                return v is not None and v > value
            raise AssertionError(f'fake does not support operator {op}')
        return FakeQuery(self._store, self._meter, [i for i in self._rows if keep(i)])

    def order_by(self, field, direction=None):
        rows = sorted(self._rows, key=lambda i: i[1].get(field) or '',
                      reverse=(direction == 'DESCENDING'))
        return FakeQuery(self._store, self._meter, rows)

    def limit(self, n):
        return FakeQuery(self._store, self._meter, self._rows[:n])

    def stream(self):
        self._meter['queries'] += 1
        # Firestore bills a minimum of one read even for an empty result.
        self._meter['docs_read'] += max(1, len(self._rows))
        return [FakeStreamDoc(k, v) for k, v in self._rows]


class FakeCollection(FakeQuery):
    def document(self, doc_id):
        return FakeDocRef(self._store, doc_id, self._meter)


class FakeFirestore:
    """Records reads so a test can assert the quota cost of a cycle."""

    def __init__(self, store):
        self._store = store
        self.meter = {'queries': 0, 'docs_read': 0}

    @property
    def pulls(self):
        return self.meter['queries']

    def collection(self, name):
        return FakeCollection(self._store, self.meter)

    def transaction(self):
        return FakeTransaction(self._store)


@pytest.fixture(autouse=True)
def _mirror(tmp_path, monkeypatch):
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()
    # firebase_admin's real decorator expects a real transaction; the fake
    # applies writes directly, so pass the function through.
    import firebase_admin.firestore as fs
    monkeypatch.setattr(fs, 'transactional', lambda fn: fn)


def _seed_local(mission_id='m1', status='queued'):
    mission_store.upsert_missions(
        [{'id': mission_id, 'yardId': 'uct-rover-1', 'status': status,
          'submittedAt': '2026-07-14T08:00:00Z'}],
        '2026-07-14T09:00:00Z',
    )


# --- Push before pull ------------------------------------------------------

def test_no_pull_happens_while_the_outbox_is_non_empty():
    """The single most important behavioural guarantee. Pulling first would
    overwrite the record of a mission that physically ran."""
    _seed_local()
    remote = {}  # empty: the document does not exist remotely
    db = FakeFirestore(remote)

    # Queue a local change, then make the flush fail.
    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')

    def boom(*a, **k):
        raise RuntimeError('network down')
    db.transaction = boom

    ok = sync_worker.sync_cycle(db)

    assert ok is False
    assert db.pulls == 0, 'pulled while a local write was still pending'
    assert mission_store.outbox_count() == 1, 'entry must be retried, not dropped'


def test_pull_happens_once_the_outbox_drains():
    _seed_local()
    db = FakeFirestore({'m1': {'status': 'queued', 'submittedAt': '2026-07-14T08:00:00Z'}})

    assert sync_worker.sync_cycle(db) is True
    assert db.pulls == 1


def test_a_failed_flush_retries_the_same_entry_without_skipping_ahead():
    _seed_local()
    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    mission_store.write_and_enqueue('m1', {'youtube_url': 'u'}, 'youtube', {'youtubeUrl': 'u'})

    first_seq = mission_store.peek_outbox()['seq']

    db = FakeFirestore({})
    def boom(*a, **k):
        raise RuntimeError('down')
    db.transaction = boom
    sync_worker.sync_cycle(db)

    assert mission_store.peek_outbox()['seq'] == first_seq, 'must not skip ahead'
    assert mission_store.peek_outbox()['attempts'] == 1


def test_entries_flush_in_seq_order_not_timestamp_order():
    """The Pi has no real-time clock, so an offline boot can stamp wildly wrong
    times. Ordering must come from seq (plan 7.2)."""
    _seed_local()
    mission_store.release_mission('m1', 'processing', '2999-01-01T00:00:00Z')  # bogus future clock
    mission_store.release_mission('m1', 'completed', '2020-01-01T00:00:00Z')   # bogus past clock

    applied = []
    remote = {'m1': {'status': 'queued'}}
    db = FakeFirestore(remote)
    real_update = FakeTransaction.update

    def record(self, ref, fields):
        applied.append(fields.get('status'))
        real_update(self, ref, fields)
    FakeTransaction.update = record
    try:
        sync_worker.sync_cycle(db)
    finally:
        FakeTransaction.update = real_update

    assert applied == ['processing', 'completed'], 'seq order, not clock order'


# --- Merge rule (plan section 6) -------------------------------------------

@pytest.mark.parametrize('local,remote,expected_local_wins', [
    ('completed', 'queued', True),
    ('completed', 'processing', True),
    ('completed', 'cancelled', True),
    ('completed', 'failed', True),
    ('failed', 'cancelled', True),
    ('processing', 'completed', False),
    ('queued', 'completed', False),
    ('queued', 'processing', False),
    ('queued', 'failed', False),
])
def test_merge_rule_table(local, remote, expected_local_wins):
    assert sync_worker.should_local_win(
        {'status': local, 'statusUpdatedAt': '2026-01-01T00:00:00Z'},
        {'status': remote, 'statusUpdatedAt': '2026-01-01T00:00:00Z'},
    ) is expected_local_wins


def test_same_rank_is_broken_by_the_later_timestamp():
    assert sync_worker.should_local_win(
        {'status': 'completed', 'statusUpdatedAt': '2026-01-02T00:00:00Z'},
        {'status': 'completed', 'statusUpdatedAt': '2026-01-01T00:00:00Z'},
    ) is True
    assert sync_worker.should_local_win(
        {'status': 'completed', 'statusUpdatedAt': '2026-01-01T00:00:00Z'},
        {'status': 'completed', 'statusUpdatedAt': '2026-01-02T00:00:00Z'},
    ) is False


def test_a_non_status_change_always_applies():
    """Attaching a YouTube URL has no status to compare against."""
    assert sync_worker.should_local_win({'youtubeUrl': 'u'}, {'status': 'completed'}) is True


def test_remote_ahead_is_not_downgraded():
    _seed_local()
    remote = {'m1': {'status': 'completed', 'statusUpdatedAt': '2026-07-14T11:00:00Z'}}
    db = FakeFirestore(remote)

    mission_store.release_mission('m1', 'queued', '2026-07-14T10:00:00Z')
    sync_worker.sync_cycle(db)

    assert remote['m1']['status'] == 'completed', 'a terminal remote must not be resurrected'
    assert mission_store.outbox_count() == 0, 'the entry is still consumed, just not applied'


# --- Conflict logging ------------------------------------------------------

def test_a_losing_terminal_state_is_logged():
    _seed_local()
    remote = {'m1': {'status': 'cancelled', 'statusUpdatedAt': '2026-07-14T09:00:00Z'}}
    db = FakeFirestore(remote)

    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    sync_worker.sync_cycle(db)

    conflicts = mission_store.get_conflicts()
    assert len(conflicts) == 1
    assert conflicts[0]['local_state'] == 'completed'
    assert conflicts[0]['remote_state'] == 'cancelled'
    assert conflicts[0]['resolution'] == 'local'


def test_normal_forward_progress_is_not_logged_as_a_conflict():
    """queued losing to completed is not a conflict; logging it would bury the
    real ones in noise."""
    _seed_local()
    remote = {'m1': {'status': 'queued', 'statusUpdatedAt': '2026-07-14T09:00:00Z'}}
    db = FakeFirestore(remote)

    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    sync_worker.sync_cycle(db)

    assert mission_store.get_conflicts() == []


# --- Durability ------------------------------------------------------------

def test_an_entry_is_only_deleted_after_firestore_confirms():
    _seed_local()
    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    assert mission_store.outbox_count() == 1

    db = FakeFirestore({})
    def boom(*a, **k):
        raise RuntimeError('down')
    db.transaction = boom
    sync_worker.sync_cycle(db)
    assert mission_store.outbox_count() == 1, 'kept for retry'

    db2 = FakeFirestore({'m1': {'status': 'queued'}})
    sync_worker.sync_cycle(db2)
    assert mission_store.outbox_count() == 0, 'dropped once confirmed'


def test_flushing_releases_the_mirror_row_so_pulls_can_refresh_it():
    """local_dirty protects unflushed changes. Never clearing it would freeze
    that mission in the mirror forever."""
    _seed_local()
    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    assert mission_store.get_mission('m1')['local_dirty'] == 1

    sync_worker.sync_cycle(FakeFirestore({'m1': {'status': 'queued'}}))

    assert mission_store.get_mission('m1')['local_dirty'] == 0


def test_a_dirty_row_is_not_overwritten_by_a_pull():
    _seed_local()
    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')

    # A pull arrives carrying the stale remote state while the write is pending.
    mission_store.upsert_missions(
        [{'id': 'm1', 'status': 'queued', 'yardId': 'uct-rover-1'}],
        '2026-07-14T10:30:00Z',
    )

    assert mission_store.get_mission('m1')['status'] == 'completed', \
        'a pending local write must survive a pull'


def test_replaying_an_applied_entry_is_idempotent():
    _seed_local()
    remote = {'m1': {'status': 'queued', 'statusUpdatedAt': '2026-07-14T09:00:00Z'}}
    db = FakeFirestore(remote)

    mission_store.release_mission('m1', 'completed', '2026-07-14T10:00:00Z')
    entry = mission_store.peek_outbox()

    assert sync_worker.flush_one(db, entry) is True
    first = dict(remote['m1'])
    # Replay the same entry: a lost acknowledgement would cause exactly this.
    sync_worker.flush_one(db, entry)

    assert remote['m1'] == first, 'replay must produce one net effect'


def test_worker_keeps_running_when_the_client_cannot_be_built_yet(monkeypatch):
    """A satellite booted with no internet must still start syncing, and pick
    up once the network returns - not sit dead until someone restarts it."""
    attempts = {'n': 0}
    remote = {}

    def factory():
        attempts['n'] += 1
        if attempts['n'] == 1:
            raise RuntimeError('no internet at boot')
        return FakeFirestore(remote)

    timers = []
    monkeypatch.setattr(sync_worker.threading, 'Timer',
                        lambda i, f: type('T', (), {'daemon': False, 'start': lambda s: timers.append(f)})())

    sync_worker.start_sync_worker(factory, interval=1)
    assert attempts['n'] == 1, 'first cycle attempted despite being offline'
    assert timers, 'a retry must be scheduled even though the first cycle failed'

    timers.pop()()  # fire the scheduled retry, now "online"
    assert attempts['n'] == 2, 'the factory is retried rather than given up on'


# --- Read cost (Firestore free tier is 50,000 docs/day) --------------------

def _seed_many(n, status='completed'):
    mission_store.upsert_missions(
        [{'id': f'm{i}', 'yardId': 'uct-rover-1', 'status': status,
          'submittedAt': f'2026-07-{(i % 27) + 1:02d}T08:00:00Z'} for i in range(n)],
        '2026-07-28T09:00:00Z',
    )


def test_a_quiet_cycle_reads_almost_nothing():
    """The regression that matters. Re-pulling the collection every 30 seconds
    cost 576,000 reads/day against a 50,000/day quota."""
    _seed_many(200)
    remote = {f'm{i}': {'status': 'completed', 'submittedAt': '2026-07-01T08:00:00Z'}
              for i in range(200)}
    db = FakeFirestore(remote)

    sync_worker.sync_cycle(db, yard_id='uct-rover-1')

    assert db.meter['docs_read'] <= 2, (
        f"a quiet cycle read {db.meter['docs_read']} documents; it must read ~nothing"
    )


def test_only_new_missions_are_pulled():
    _seed_many(5)  # newest submittedAt is 2026-07-05
    remote = {f'm{i}': {'status': 'completed', 'submittedAt': f'2026-07-{i+1:02d}T08:00:00Z'}
              for i in range(5)}
    remote['brand-new'] = {'status': 'queued', 'submittedAt': '2026-07-28T10:00:00Z'}
    db = FakeFirestore(remote)

    sync_worker.sync_cycle(db, yard_id='uct-rover-1')

    assert mission_store.get_mission('brand-new') is not None
    assert db.meter['docs_read'] <= 2, 'only the new mission should have been read'


def test_an_empty_mirror_does_one_bounded_first_pull():
    remote = {f'm{i}': {'status': 'completed', 'submittedAt': '2026-07-01T08:00:00Z'}
              for i in range(500)}
    db = FakeFirestore(remote)

    sync_worker.sync_cycle(db, yard_id='uct-rover-1')

    assert db.meter['docs_read'] <= sync_worker.FIRST_PULL_LIMIT, 'the first pull must be bounded'


def test_active_missions_are_reconciled_periodically():
    """An incremental pull keyed on submittedAt cannot see a status change made
    elsewhere, so non-terminal missions are re-read on a slower cadence."""
    _seed_many(3, status='queued')
    remote = {
        'm0': {'status': 'completed', 'yardId': 'uct-rover-1', 'submittedAt': '2026-07-01T08:00:00Z'},
        'm1': {'status': 'queued', 'yardId': 'uct-rover-1', 'submittedAt': '2026-07-02T08:00:00Z'},
        'm2': {'status': 'queued', 'yardId': 'uct-rover-1', 'submittedAt': '2026-07-03T08:00:00Z'},
    }
    db = FakeFirestore(remote)

    # Cycles before the reconcile point must not pick the change up...
    for _ in range(sync_worker.RECONCILE_EVERY - 1):
        sync_worker.sync_cycle(db, yard_id='uct-rover-1')
    assert mission_store.get_mission('m0')['status'] == 'queued'

    # ...and the reconcile cycle must.
    sync_worker.sync_cycle(db, yard_id='uct-rover-1')
    assert mission_store.get_mission('m0')['status'] == 'completed'


def test_reconcile_does_not_re_read_terminal_missions():
    """Completed missions do not move, so paying to re-read them is waste."""
    _seed_many(3, status='queued')
    remote = {f'done{i}': {'status': 'completed', 'yardId': 'uct-rover-1',
                           'submittedAt': '2026-07-01T08:00:00Z'} for i in range(100)}
    remote['live'] = {'status': 'queued', 'yardId': 'uct-rover-1',
                      'submittedAt': '2026-07-02T08:00:00Z'}
    db = FakeFirestore(remote)

    sync_worker.reconcile_active(db, yard_id='uct-rover-1')

    assert db.meter['docs_read'] <= 3, (
        f"reconcile read {db.meter['docs_read']} docs; it must only touch active ones"
    )


def test_freshness_is_still_reported_on_a_cycle_that_pulls_nothing():
    """Otherwise the console shows itself as stale despite being connected."""
    _seed_many(2)
    db = FakeFirestore({'m0': {'status': 'completed', 'submittedAt': '2026-07-01T08:00:00Z'}})

    mission_store.set_meta('last_synced_at', '2020-01-01T00:00:00Z')
    sync_worker.sync_cycle(db, yard_id='uct-rover-1')

    _, last_synced, _total = mission_store.get_missions()
    assert last_synced > '2026-01-01', 'last_synced_at must advance on a quiet cycle'


def test_reconcile_drops_a_mission_deleted_remotely():
    """Nothing else prunes the mirror, so a deleted mission would otherwise sit
    in the console forever - and stay dispatchable."""
    _seed_local('gone', status='queued')
    _seed_local('alive', status='queued')
    remote = {'alive': {'status': 'queued', 'yardId': 'uct-rover-1'}}

    sync_worker.reconcile_active(FakeFirestore(remote), yard_id='uct-rover-1')

    assert mission_store.get_mission('gone') is None
    assert mission_store.get_mission('alive') is not None


def test_a_mission_with_unflushed_writes_is_never_pruned():
    """Removing it would silently discard a local change that never reached
    Firestore - exactly the loss push-before-pull exists to prevent."""
    _seed_local('gone', status='queued')
    mission_store.release_mission('gone', 'completed', '2026-07-28T10:00:00Z')

    sync_worker.reconcile_active(FakeFirestore({}), yard_id='uct-rover-1')

    assert mission_store.get_mission('gone') is not None
    assert mission_store.outbox_count() == 1
