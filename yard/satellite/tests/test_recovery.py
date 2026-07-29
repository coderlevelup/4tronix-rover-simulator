"""
Recovery tests - plan section 5 (PR 4) and 2.3.

The governing rule is that nothing moves the robot without a human. The most
important assertions here are the ones counting rover calls: recovery must
never re-dispatch, because a physical action cannot be replayed.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import mission_store  # noqa: E402
import recovery  # noqa: E402

OWNER = 'sat-under-test'
OTHER = 'some-other-satellite'


@pytest.fixture(autouse=True)
def _mirror(tmp_path, monkeypatch):
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()


def _seed(mission_id, status, owner=None, needs_review=0):
    mission_store.upsert_missions(
        [{'id': mission_id, 'yardId': 'uct-rover-1', 'status': status,
          'lockOwner': owner, 'needsReview': needs_review,
          'submittedAt': '2026-07-14T08:00:00Z'}],
        '2026-07-14T09:00:00Z',
    )


class NoRover:
    """Any call is a failure: recovery must not touch the rover."""

    def __init__(self):
        self.calls = []

    def get(self, url, timeout=None):
        self.calls.append(url)
        raise AssertionError(f'recovery contacted the rover: {url}')


def test_an_interrupted_mission_is_flagged_not_failed(monkeypatch):
    """Marking it failed would assert an outcome nobody established, and
    'failed' reaches the learner as a run that went wrong."""
    _seed('m1', 'processing', owner=OWNER)

    resolved, flagged = recovery.recover_interrupted_missions(OWNER)

    assert flagged == ['m1'] and resolved == []
    row = mission_store.get_mission('m1')
    assert row['needs_review'] == 1
    assert row['review_reason'] == 'interrupted'
    assert row['status'] == 'processing', 'status must not be invented'


def test_recovery_never_dispatches_to_the_rover(monkeypatch):
    """PR 4's acceptance: kill the satellite mid-mission, restart, and the
    mission appears under review with no rover movement."""
    _seed('m1', 'processing', owner=OWNER)
    rover = NoRover()
    monkeypatch.setattr(recovery.requests, 'post', rover.get)

    recovery.recover_interrupted_missions(OWNER)  # no rover_url at all

    assert rover.calls == []
    assert [m['id'] for m in mission_store.get_needs_review()] == ['m1']


def test_missions_owned_by_another_satellite_are_left_alone():
    _seed('m1', 'processing', owner=OTHER)

    resolved, flagged = recovery.recover_interrupted_missions(OWNER)

    assert (resolved, flagged) == ([], [])
    assert mission_store.get_mission('m1')['needs_review'] == 0


def test_queued_and_completed_missions_are_untouched():
    _seed('q1', 'queued', owner=OWNER)
    _seed('c1', 'completed', owner=OWNER)

    resolved, flagged = recovery.recover_interrupted_missions(OWNER)

    assert (resolved, flagged) == ([], [])


def test_a_mission_already_under_review_is_not_reflagged():
    _seed('m1', 'processing', owner=OWNER, needs_review=1)

    resolved, flagged = recovery.recover_interrupted_missions(OWNER)

    assert flagged == [], 're-flagging would queue a duplicate outbox entry each boot'


def test_rover_confirmation_resolves_without_a_human(monkeypatch):
    """The rover is the one authority that can settle this: it either ran the
    code to the end or it did not."""
    _seed('m1', 'processing', owner=OWNER)

    class Resp:
        status_code = 200
        def json(self):
            # Real shape: the id is inside params (see RoverService.add_instructions).
            return {'history': [{'cmd': 'run_python', 'status': 'completed',
                                 'params': {'mission_id': 'm1'}}]}

    monkeypatch.setattr(recovery.requests, 'get', lambda *a, **k: Resp())

    resolved, flagged = recovery.recover_interrupted_missions(OWNER, rover_url='http://rover')

    assert resolved == ['m1'] and flagged == []
    row = mission_store.get_mission('m1')
    assert row['status'] == 'completed'
    assert row['needs_review'] == 0
    assert row['lock_owner'] is None, 'the lock must be released'


def test_an_unreachable_rover_falls_back_to_review_not_completion(monkeypatch):
    """"I could not tell" must never be read as "it finished"."""
    _seed('m1', 'processing', owner=OWNER)

    def boom(*a, **k):
        raise recovery.requests.exceptions.ConnectionError('rover offline')
    monkeypatch.setattr(recovery.requests, 'get', boom)

    resolved, flagged = recovery.recover_interrupted_missions(OWNER, rover_url='http://rover')

    assert flagged == ['m1'] and resolved == []
    assert mission_store.get_mission('m1')['status'] == 'processing'


def test_a_rover_that_does_not_know_the_mission_falls_back_to_review(monkeypatch):
    _seed('m1', 'processing', owner=OWNER)

    class Resp:
        status_code = 200
        def json(self):
            return {'history': [{'cmd': 'run_python', 'status': 'completed',
                                 'params': {'mission_id': 'something-else'}}]}

    monkeypatch.setattr(recovery.requests, 'get', lambda *a, **k: Resp())

    _, flagged = recovery.recover_interrupted_missions(OWNER, rover_url='http://rover')
    assert flagged == ['m1']


def test_a_rover_reporting_a_non_completion_falls_back_to_review(monkeypatch):
    _seed('m1', 'processing', owner=OWNER)

    class Resp:
        status_code = 200
        def json(self):
            return {'history': [{'cmd': 'run_python', 'status': 'error',
                                 'params': {'mission_id': 'm1'}}]}

    monkeypatch.setattr(recovery.requests, 'get', lambda *a, **k: Resp())

    _, flagged = recovery.recover_interrupted_missions(OWNER, rover_url='http://rover')
    assert flagged == ['m1'], 'only an explicit completion resolves automatically'


def test_flagging_queues_the_flag_for_firestore():
    """Otherwise the review state is invisible to anyone but this satellite."""
    _seed('m1', 'processing', owner=OWNER)

    recovery.recover_interrupted_missions(OWNER)

    entry = mission_store.peek_outbox()
    assert entry is not None
    assert entry['mission_id'] == 'm1'
    assert entry['op'] == 'review'


def test_history_entries_without_params_are_ignored(monkeypatch):
    """Manual drive commands have no mission_id; they must not be mistaken for
    a mission's completion."""
    _seed('m1', 'processing', owner=OWNER)

    class Resp:
        status_code = 200
        def json(self):
            return {'history': [
                {'cmd': 'forward', 'status': 'completed'},          # no params at all
                {'cmd': 'stop', 'status': 'completed', 'params': {}},  # params, no id
            ]}

    monkeypatch.setattr(recovery.requests, 'get', lambda *a, **k: Resp())

    _, flagged = recovery.recover_interrupted_missions(OWNER, rover_url='http://rover')
    assert flagged == ['m1']
