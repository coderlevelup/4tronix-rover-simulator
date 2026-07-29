"""
Mission watcher tests.

The watcher completes missions the rover confirms. The dangerous failure mode
is marking something complete that never ran, so most of these check that it
stays quiet when it cannot be sure.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import mission_store  # noqa: E402
import mission_watcher  # noqa: E402

ROVER = 'http://rover.local:8523'


@pytest.fixture(autouse=True)
def _mirror(tmp_path, monkeypatch):
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'm.db'))
    mission_store.init_db()


def _seed(mission_id, status, needs_review=0, owner='sat-1'):
    mission_store.upsert_missions(
        [{'id': mission_id, 'yardId': 'uct-rover-1', 'status': status,
          'lockOwner': owner, 'needsReview': needs_review,
          'submittedAt': '2026-07-14T08:00:00Z'}],
        '2026-07-14T09:00:00Z',
    )


def _rover(history):
    class Resp:
        status_code = 200
        def json(self):
            return {'history': history}
    return lambda *a, **k: Resp()


def _done(mission_id):
    return {'cmd': 'run_python', 'status': 'completed', 'params': {'mission_id': mission_id}}


def test_a_confirmed_mission_is_completed(monkeypatch):
    """The whole point: an operator should not have to remember to tap
    'Mark complete' for a run the rover already finished."""
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == ['m1']

    row = mission_store.get_mission('m1')
    assert row['status'] == 'completed'
    assert row['completed_at']
    assert row['lock_owner'] is None, 'the lease must be released too'


def test_completion_is_queued_for_firestore(monkeypatch):
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    mission_watcher.autocomplete_finished_missions(ROVER)

    entry = mission_store.peek_outbox()
    assert entry and entry['mission_id'] == 'm1'


def test_the_learner_notification_fires(monkeypatch):
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))
    calls = []

    mission_watcher.autocomplete_finished_missions(ROVER, notify=lambda i, s: calls.append((i, s)))

    assert calls == [('m1', 'completed')]


def test_a_failing_notify_does_not_lose_the_completion(monkeypatch):
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    def boom(*a):
        raise RuntimeError('mission-control down')

    mission_watcher.autocomplete_finished_missions(ROVER, notify=boom)

    assert mission_store.get_mission('m1')['status'] == 'completed'


def test_a_rover_error_does_not_mark_the_mission_failed(monkeypatch):
    """'The code raised' is not 'the run was a failure', and a learner must
    never be shown a failed mission. Leave it for a human."""
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([
        {'cmd': 'run_python', 'status': 'error', 'params': {'mission_id': 'm1'}},
    ]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []
    assert mission_store.get_mission('m1')['status'] == 'processing'


def test_an_unreachable_rover_changes_nothing(monkeypatch):
    _seed('m1', 'processing')

    def boom(*a, **k):
        raise mission_watcher.requests.exceptions.ConnectionError('offline')
    monkeypatch.setattr(mission_watcher.requests, 'get', boom)

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []
    assert mission_store.get_mission('m1')['status'] == 'processing'


def test_missions_awaiting_human_review_are_left_alone(monkeypatch):
    """A flagged mission is the operator's decision to make."""
    _seed('m1', 'processing', needs_review=1)
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []
    assert mission_store.get_mission('m1')['needs_review'] == 1


def test_a_mission_with_pending_writes_is_skipped(monkeypatch):
    """Do not race a flush that is already carrying a change for this row."""
    _seed('m1', 'processing')
    mission_store.write_and_enqueue('m1', {'youtube_url': 'u'}, 'youtube', {'youtubeUrl': 'u'})
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []


def test_already_terminal_missions_are_not_touched(monkeypatch):
    _seed('c1', 'completed')
    _seed('q1', 'queued')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('c1'), _done('q1')]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []
    assert mission_store.get_mission('q1')['status'] == 'queued', 'a queued mission never ran'


def test_manual_drive_history_is_ignored(monkeypatch):
    """Tapping a drive block produces history with no mission_id."""
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([
        {'cmd': 'forward', 'status': 'completed'},
        {'cmd': 'stop', 'status': 'completed', 'params': {}},
    ]))

    assert mission_watcher.autocomplete_finished_missions(ROVER) == []


def test_the_watcher_never_sends_anything_to_the_rover(monkeypatch):
    """Plan 2.3: it may record an outcome, never cause a physical action."""
    _seed('m1', 'processing')
    monkeypatch.setattr(mission_watcher.requests, 'get', _rover([_done('m1')]))

    def no_post(*a, **k):
        raise AssertionError('the watcher POSTed to the rover')
    monkeypatch.setattr(mission_watcher.requests, 'post', no_post)

    mission_watcher.autocomplete_finished_missions(ROVER)


def test_the_rover_url_is_read_each_cycle(monkeypatch):
    """It is editable at runtime from /status, so capturing it once would leave
    the watcher polling a stale address after an operator fixes it."""
    urls = []
    monkeypatch.setattr(mission_watcher.requests, 'get',
                        lambda url, **k: urls.append(url) or _rover([])(url))
    fired = []
    monkeypatch.setattr(mission_watcher.threading, 'Timer',
                        lambda i, f: type('T', (), {'daemon': False,
                                                    'start': lambda s: fired.append(f)})())

    changing = iter(['http://first', 'http://second'])
    mission_watcher.start_mission_watcher(lambda: next(changing), interval=1)
    fired.pop()()

    assert urls[0].startswith('http://first')
    assert urls[1].startswith('http://second')
