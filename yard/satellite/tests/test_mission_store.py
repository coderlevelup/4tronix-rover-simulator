"""
Mission mirror (SQLite) tests - schema, upsert semantics, and reads.

Covers yard/docs/offline-sync-test.md section B1-B3 (tests #16-26): the
satellite-local store that lets the operator console list missions with no
internet. See yard/docs/offline-sync-plan.md section 3.2 for the schema.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import mission_store  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'missions.db'))
    mission_store.init_db()


def _mission(mission_id, status='queued', **overrides):
    m = {
        'id': mission_id,
        'name': f'Mission {mission_id}',
        'yardId': 'uct-rover-1',
        'code': 'rover.forward(10)',
        'blocklyState': '{"blocks":{}}',
        'status': status,
        'submittedAt': '2026-07-14T08:00:00Z',
    }
    m.update(overrides)
    return m


# ---------------------------------------------------------------------------
# B1: schema and init
# ---------------------------------------------------------------------------

def test_init_db_creates_expected_tables():
    conn = mission_store._connect()
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    names = {row['name'] for row in rows}
    assert {'mission_mirror', 'outbox', 'sync_meta', 'conflict_log'} <= names


def test_init_db_is_idempotent():
    mission_store.init_db()  # second call must not raise


# ---------------------------------------------------------------------------
# B2: upsert_missions
# ---------------------------------------------------------------------------

def test_upsert_inserts_new_missions():
    mission_store.upsert_missions(
        [_mission('a'), _mission('b'), _mission('c')], '2026-07-14T09:00:00Z',
    )
    missions, _, _total = mission_store.get_missions()
    assert {m['id'] for m in missions} == {'a', 'b', 'c'}


def test_upsert_updates_existing_mission_status():
    mission_store.upsert_missions([_mission('a', status='queued')], '2026-07-14T09:00:00Z')
    mission_store.upsert_missions([_mission('a', status='completed')], '2026-07-14T09:05:00Z')
    assert mission_store.get_mission('a')['status'] == 'completed'


def test_upsert_does_not_overwrite_a_dirty_row():
    # local_dirty=1 means a local write hasn't flushed to Firestore yet (PR 3).
    # A pull landing in the middle of that must not clobber it.
    mission_store.upsert_missions([_mission('a', status='queued')], '2026-07-14T09:00:00Z')

    conn = mission_store._connect()
    conn.execute("UPDATE mission_mirror SET local_dirty = 1, status = 'completed' WHERE id = 'a'")
    conn.commit()
    conn.close()

    mission_store.upsert_missions([_mission('a', status='queued')], '2026-07-14T09:10:00Z')

    assert mission_store.get_mission('a')['status'] == 'completed'
    assert mission_store.get_mission('a')['local_dirty'] == 1


def test_upsert_stores_last_synced_at_in_sync_meta():
    mission_store.upsert_missions([_mission('a')], '2026-07-14T09:00:00Z')
    _, last_synced, _total = mission_store.get_missions()
    assert last_synced == '2026-07-14T09:00:00Z'


def test_upsert_maps_camel_case_firestore_fields_to_snake_case_columns():
    mission_store.upsert_missions(
        [_mission('a', yardId='uct-rover-1', blocklyState='{"x":1}')],
        '2026-07-14T09:00:00Z',
    )
    row = mission_store.get_mission('a')
    assert row['yard_id'] == 'uct-rover-1'
    assert row['blockly_state'] == '{"x":1}'


# ---------------------------------------------------------------------------
# B3: get_missions / get_mission
# ---------------------------------------------------------------------------

def test_get_missions_orders_by_submitted_at_descending():
    mission_store.upsert_missions([
        _mission('old', submittedAt='2026-07-14T06:00:00Z'),
        _mission('new', submittedAt='2026-07-14T09:00:00Z'),
    ], '2026-07-14T09:00:00Z')
    missions, _, _total = mission_store.get_missions()
    assert missions[0]['id'] == 'new'


def test_get_missions_excludes_cancelled():
    mission_store.upsert_missions([
        _mission('a', status='queued'),
        _mission('b', status='cancelled'),
    ], '2026-07-14T09:00:00Z')
    missions, _, _total = mission_store.get_missions()
    assert {m['id'] for m in missions} == {'a'}


def test_the_limit_applies_to_finished_missions_only():
    """The cap exists to stop the console rendering an unbounded backlog of old
    completed runs. It must not apply to work the operator still has to do."""
    mission_store.upsert_missions(
        [_mission(f'done{i}', status='completed', submittedAt=f'2026-07-14T08:{i:02d}:00Z')
         for i in range(10)]
        + [_mission(f'todo{i}', status='queued', submittedAt=f'2026-07-15T08:{i:02d}:00Z')
           for i in range(4)],
        '2026-07-16T09:00:00Z',
    )

    missions, _, _total = mission_store.get_missions(limit=3)

    finished = [m for m in missions if m['status'] == 'completed']
    queued = [m for m in missions if m['status'] == 'queued']
    assert len(finished) == 3, 'finished missions are capped'
    assert len(queued) == 4, 'queued missions are all shown'


def test_get_mission_returns_none_for_unknown_id():
    assert mission_store.get_mission('nonexistent') is None


def test_outbox_count_starts_at_zero():
    assert mission_store.outbox_count() == 0


def test_outbox_count_reflects_inserted_rows():
    conn = mission_store._connect()
    conn.execute(
        "INSERT INTO outbox (uuid, mission_id, op, payload, event_at, created_at) "
        "VALUES ('u1', 'a', 'complete', '{}', '2026-07-14T09:00:00Z', '2026-07-14T09:00:00Z')"
    )
    conn.commit()
    conn.close()
    assert mission_store.outbox_count() == 1


def test_get_missions_scopes_to_a_yard(tmp_path, monkeypatch):
    """A satellite must never list, and therefore never dispatch, a mission
    belonging to another yard."""
    import mission_store
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()

    mission_store.upsert_missions([
        {'id': 'a', 'yardId': 'uct-rover-1', 'status': 'queued', 'submittedAt': '2026-01-02'},
        {'id': 'b', 'yardId': 'durban-rover-1', 'status': 'queued', 'submittedAt': '2026-01-01'},
    ], '2026-01-03T00:00:00Z')

    scoped, _, _total = mission_store.get_missions(yard_id='uct-rover-1')
    assert [m['id'] for m in scoped] == ['a']

    unscoped, _, _total = mission_store.get_missions()
    assert {m['id'] for m in unscoped} == {'a', 'b'}


def test_actionable_missions_are_never_capped(tmp_path, monkeypatch):
    """A flat newest-N cap drops the oldest rows, which are exactly the ones an
    operator still has work to do on. Queued work must never be hidden."""
    import mission_store
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()

    # 30 finished missions, all newer than the queued one.
    mission_store.upsert_missions(
        [{'id': f'done{i}', 'yardId': 'uct-rover-1', 'status': 'completed',
          'submittedAt': f'2026-07-{i+1:02d}T08:00:00Z'} for i in range(30)]
        + [{'id': 'old-queued', 'yardId': 'uct-rover-1', 'status': 'queued',
            'submittedAt': '2020-01-01T08:00:00Z'}],
        '2026-07-31T00:00:00Z',
    )

    rows, _, _total = mission_store.get_missions(limit=5, yard_id='uct-rover-1')
    ids = {r['id'] for r in rows}

    assert 'old-queued' in ids, 'a queued mission must never fall off the list'
    assert len([r for r in rows if r['status'] == 'completed']) == 5, 'finished ones are capped'


def test_cancelled_missions_stay_hidden(tmp_path, monkeypatch):
    import mission_store
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()
    mission_store.upsert_missions(
        [{'id': 'x', 'yardId': 'uct-rover-1', 'status': 'cancelled', 'submittedAt': '2026-07-01'}],
        '2026-07-02',
    )

    rows, _, _total = mission_store.get_missions(yard_id='uct-rover-1')
    assert rows == []
