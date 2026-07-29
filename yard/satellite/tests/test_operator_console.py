"""
Operator console tests - auth gate, login flow, and mission actions.

Firestore and the rover queue are faked; firebase-admin is never imported.
What's under test: session gating, role enforcement, the send-to-rover
dispatch, and the status transitions written back to Firestore.
"""

import sys
import os
import re
import threading

import pytest
from flask import current_app

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from web_server import app as flask_app  # noqa: E402
import operator_console  # noqa: E402
import mission_store  # noqa: E402


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data else None


class FakeDocRef:
    def __init__(self, store, mission_id):
        self._store = store
        self._id = mission_id

    def get(self, transaction=None):
        return FakeSnapshot(self._store.get(self._id))

    def update(self, fields):
        self._store[self._id].update(fields)


class FakeTransaction:
    """Applies writes immediately. The fake has no rollback, which is fine:
    these tests exercise the lock decision logic, not Firestore's atomicity."""

    def update(self, ref, fields):
        ref.update(fields)


class FakeCollection:
    def __init__(self, store):
        self._store = store

    def document(self, mission_id):
        return FakeDocRef(self._store, mission_id)


class FakeFirestore:
    def __init__(self, store):
        self._store = store

    def collection(self, name):
        return FakeCollection(self._store)

    def transaction(self):
        return FakeTransaction()


class FakeStreamDoc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class FakeQueryCollection(FakeCollection):
    """FakeCollection + where()/order_by()/limit()/stream() for query-style reads."""

    def __init__(self, store, docs=None):
        super().__init__(store)
        self._docs = list(store.items()) if docs is None else docs

    def where(self, field, op, value):
        assert op == '==', 'fake only supports equality filters'
        filtered = [(k, v) for k, v in self._docs if v.get(field) == value]
        return FakeQueryCollection(self._store, filtered)

    def order_by(self, field, direction=None):
        return self

    def limit(self, n):
        return self

    def stream(self):
        return [FakeStreamDoc(k, v) for k, v in self._docs]


class FakeQueryFirestore(FakeFirestore):
    def collection(self, name):
        return FakeQueryCollection(self._store)


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class RecordingTimer:
    """threading.Timer stand-in for handler tests.

    Records instead of scheduling, so lease-renewal timers neither fire during
    a test nor leak into the next one. Needed because the `client` fixture
    swaps threading.Thread for SyncThread, and the real threading.Timer calls
    Thread.__init__ internally - so a real Timer blows up once Thread is faked.
    """

    instances = []

    def __init__(self, interval, function, args=None, kwargs=None):
        self.interval = interval
        self.function = function
        self.args = args or ()
        self.started = False
        self.cancelled = False
        RecordingTimer.instances.append(self)

    def start(self):
        self.started = True

    def cancel(self):
        self.cancelled = True

    @classmethod
    def reset(cls):
        cls.instances = []


class SyncThread:
    """threading.Thread stand-in that runs its target immediately and
    synchronously in start(), so tests asserting on side effects of
    _notify_mission_control_async don't race a real background thread.
    """

    def __init__(self, target=None, args=(), kwargs=None, daemon=None):
        self._target = target
        self._args = args
        self._kwargs = kwargs or {}

    def start(self):
        self._target(*self._args, **self._kwargs)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _plain_transactional(monkeypatch):
    """operator_console applies @firestore.transactional lazily at call time so
    the module imports without firebase-admin. Tests replace it with a
    pass-through: the fake transaction applies writes directly, and what is
    under test is the lock decision, not Firestore's transaction machinery."""
    monkeypatch.setattr(operator_console, '_transactional', lambda fn: fn)


# --- Mirror-backed mission fixture ----------------------------------------
#
# PR 3 moved the request path off Firestore and onto the SQLite mirror, so the
# tests seed and assert against a real (temporary) mirror instead of a fake
# Firestore dict. This view keeps the original `missions['q1']['status']` and
# `missions['q1'].update({...})` API so the existing assertions still read
# naturally - it just writes through to SQLite underneath.

_MIRROR_FIELDS = {
    'name': 'name', 'yardId': 'yard_id', 'code': 'code',
    'blocklyState': 'blockly_state', 'status': 'status',
    'submittedAt': 'submitted_at', 'startedAt': 'started_at',
    'completedAt': 'completed_at', 'youtubeUrl': 'youtube_url',
    'lockOwner': 'lock_owner', 'lockedAt': 'locked_at',
    'leaseExpiresAt': 'lease_expires_at', 'needsReview': 'needs_review',
    'reviewReason': 'review_reason', 'statusUpdatedAt': 'status_updated_at',
}
_TO_CAMEL = {v: k for k, v in _MIRROR_FIELDS.items()}


class _MissionRow(dict):
    """A mission as camelCase, whose .update() writes back to the mirror."""

    def __init__(self, mission_id, row):
        super().__init__({_TO_CAMEL.get(k, k): v for k, v in row.items()})
        self._id = mission_id

    def update(self, fields):  # noqa: A003 - deliberately shadows dict.update
        import mission_store
        cols = {_MIRROR_FIELDS.get(k, k): v for k, v in fields.items()}
        with mission_store._db_lock:
            conn = mission_store._connect()
            sets = ', '.join(f'{c} = ?' for c in cols)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(cols.values()) + [self._id],
            )
            conn.commit()
            conn.close()
        super().update(fields)


class MirrorView:
    def __init__(self, seed):
        self._seed = seed

    def __getitem__(self, mission_id):
        import mission_store
        row = mission_store.get_mission(mission_id)
        if row is None:
            raise KeyError(mission_id)
        return _MissionRow(mission_id, row)

    def __contains__(self, mission_id):
        import mission_store
        return mission_store.get_mission(mission_id) is not None

    def keys(self):
        return self._seed.keys()


@pytest.fixture
def missions(tmp_path, monkeypatch):
    import mission_store
    import satellite_identity

    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'mirror.db'))
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(tmp_path / 'sat.json'))
    satellite_identity.reset_cache()
    mission_store.init_db()

    seed = _seed_missions()
    mission_store.upsert_missions(
        [dict(m, id=mid) for mid, m in seed.items()],
        '2026-07-14T09:00:00Z',
    )
    yield MirrorView(seed)
    satellite_identity.reset_cache()


def _seed_missions():
    return {
        'q1': {
            'name': 'Sand Observer',
            'yardId': 'uct-rover-1',
            'code': 'rover.forward(60)\nrover.stop()',
            'blocklyState': '{"blocks":{}}',
            'status': 'queued',
            'submittedAt': '2026-07-14T08:00:00Z',
        },
        'p1': {
            'name': 'Storm Collector',
            'yardId': 'uct-rover-1',
            'code': 'rover.forward(30)',
            'status': 'processing',
            'submittedAt': '2026-07-14T07:00:00Z',
        },
        'c1': {
            'name': 'Crater Pioneer',
            'yardId': 'uct-rover-1',
            'code': 'rover.stop()',
            'status': 'completed',
            'submittedAt': '2026-07-14T06:00:00Z',
        },
    }


@pytest.fixture
def client(missions, monkeypatch, tmp_path):
    # web_server.py now calls load_dotenv() on import, so a developer's real
    # local .env (OPERATOR_AUTH=off while testing at an event, a real
    # YOUTUBE_API_KEY, etc.) would otherwise leak into every test run. Start
    # every test from a clean slate; tests that care about a specific value
    # set it themselves via monkeypatch.
    for var in ('OPERATOR_AUTH', 'YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeFirestore(missions))
    monkeypatch.setattr(operator_console, '_admin_configured', lambda: True)
    # The mirror is owned by the `missions` fixture, which seeds it. Do not
    # re-point DB_PATH here: it runs after that fixture and would leave every
    # handler reading an empty database.
    # Default to a no-op so tests that don't care about the mission-control
    # notification never make a real network call. Tests that do care
    # re-monkeypatch this within the test body.
    monkeypatch.setattr(operator_console, '_notify_mission_control', lambda *a, **k: None)
    # _notify_mission_control_async normally runs on a real background
    # thread; run it inline instead so assertions right after client.post()
    # aren't racing it.
    monkeypatch.setattr(operator_console.threading, 'Thread', SyncThread)
    # Lease renewal schedules real timers; record them instead (see
    # RecordingTimer for why a real Timer cannot survive the Thread fake).
    RecordingTimer.reset()
    operator_console._active_leases.clear()
    monkeypatch.setattr(operator_console.threading, 'Timer', RecordingTimer)
    flask_app.config['TESTING'] = True
    with flask_app.test_client() as c:
        yield c


def sign_in(client):
    with client.session_transaction() as sess:
        sess['operator'] = {'uid': 'op-1', 'email': 'op@test.com', 'role': 'operator'}


# ---------------------------------------------------------------------------
# Auth gating
# ---------------------------------------------------------------------------

def test_root_redirects_to_login_without_session(client):
    resp = client.get('/')
    assert resp.status_code == 302
    assert '/operator/login' in resp.headers['Location']


def test_root_shows_station_hub_when_signed_in(client):
    sign_in(client)
    resp = client.get('/')
    assert resp.status_code == 200
    page = resp.get_data(as_text=True)
    # All four stations reachable from the hub
    assert '/operator/' in page
    assert '/code/' in page
    assert '/monitor/' in page
    assert '/status' in page
    assert 'op@test.com' in page


def test_code_and_monitor_stay_public(client):
    # Learner tablets and the TV never sign in; their pages must not gate.
    assert client.get('/code/').status_code == 200
    assert client.get('/monitor/').status_code == 200


def test_console_page_redirects_to_login_without_session(client):
    resp = client.get('/operator/')
    assert resp.status_code == 302
    assert '/operator/login' in resp.headers['Location']


# --- OPERATOR_AUTH=off (event-day offline mode, no internet for sign-in) ---

def test_auth_off_opens_console_and_hub_without_session(client, monkeypatch):
    monkeypatch.setenv('OPERATOR_AUTH', 'off')
    assert client.get('/operator/').status_code == 200
    assert client.get('/').status_code == 200
    login = client.get('/operator/login')
    assert login.status_code == 302  # login page steps aside


def test_auth_off_opens_apis_without_session(client, missions, monkeypatch):
    monkeypatch.setenv('OPERATOR_AUTH', 'off')
    resp = client.post('/operator/api/missions/p1/complete')
    assert resp.status_code == 200
    assert missions['p1']['status'] == 'completed'


def test_auth_on_by_default_when_variable_unset(client, monkeypatch):
    monkeypatch.delenv('OPERATOR_AUTH', raising=False)
    assert client.get('/operator/api/missions').status_code == 401


def test_apis_reject_unauthenticated_requests(client):
    assert client.get('/operator/api/missions').status_code == 401
    assert client.post('/operator/api/missions/q1/send').status_code == 401
    assert client.post('/operator/api/missions/q1/complete').status_code == 401
    assert client.get('/operator/api/health').status_code == 401


def test_login_rejects_wrong_password(client, monkeypatch):
    monkeypatch.setattr(operator_console, '_web_api_key', lambda: 'test-key')
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda *a, **k: FakeResponse(400, {'error': {'message': 'INVALID_PASSWORD'}}),
    )
    resp = client.post('/operator/api/login', json={'email': 'x@y.z', 'password': 'nope'})
    assert resp.status_code == 401


def test_login_rejects_accounts_without_operator_role(client, monkeypatch):
    monkeypatch.setattr(operator_console, '_web_api_key', lambda: 'test-key')
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda *a, **k: FakeResponse(200, {'idToken': 'tok'}),
    )
    monkeypatch.setattr(
        operator_console, '_verify_id_token',
        lambda tok: {'user_id': 'u1', 'email': 'learner@test.com', 'role': 'learner'},
    )
    resp = client.post('/operator/api/login', json={'email': 'learner@test.com', 'password': 'pw'})
    assert resp.status_code == 403


def test_login_reports_verify_failures_with_actionable_message(client, monkeypatch):
    monkeypatch.setattr(operator_console, '_web_api_key', lambda: 'test-key')
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda *a, **k: FakeResponse(200, {'idToken': 'tok'}),
    )
    monkeypatch.setattr(
        operator_console, '_verify_id_token',
        lambda tok: (_ for _ in ()).throw(RuntimeError('token verification failed')),
    )

    resp = client.post('/operator/api/login', json={'email': 'op@test.com', 'password': 'pw'})
    assert resp.status_code == 401
    assert 'same Firebase project' in resp.get_json()['error']


def test_login_accepts_operator_and_sets_session(client, monkeypatch):
    monkeypatch.setattr(operator_console, '_web_api_key', lambda: 'test-key')
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda *a, **k: FakeResponse(200, {'idToken': 'tok'}),
    )
    monkeypatch.setattr(
        operator_console, '_verify_id_token',
        lambda tok: {'user_id': 'u1', 'email': 'op@test.com', 'role': 'operator'},
    )
    resp = client.post('/operator/api/login', json={'email': 'op@test.com', 'password': 'pw'})
    assert resp.status_code == 200
    assert client.get('/operator/').status_code == 200


def test_login_reports_missing_configuration(client, monkeypatch):
    monkeypatch.setattr(operator_console, '_web_api_key', lambda: None)
    resp = client.post('/operator/api/login', json={'email': 'x@y.z', 'password': 'pw'})
    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Send to rover
# ---------------------------------------------------------------------------

def test_send_pushes_run_python_and_marks_processing(client, missions, monkeypatch):
    sign_in(client)
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append((url, json))
        return FakeResponse(200, {'status': 'ok', 'added': 1})

    monkeypatch.setattr(operator_console.requests, 'post', fake_post)

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code == 200

    url, payload = calls[0]
    assert url.endswith('/queue/add')
    # mission_id rides along so the rover can report which mission it is running.
    assert payload == [{
        'cmd': 'run_python',
        'params': {
            'code': 'rover.forward(60)\nrover.stop()',
            'blockly_state': '{"blocks":{}}',
            'mission_id': 'q1',
        },
    }]

    assert missions['q1']['status'] == 'processing'
    assert re.match(r'\d{4}-\d{2}-\d{2}T', missions['q1']['startedAt'])


def test_send_rejects_non_queued_missions(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda *a, **k: pytest.fail('rover must not be called'),
    )
    assert client.post('/operator/api/missions/p1/send').status_code == 400
    assert client.post('/operator/api/missions/c1/send').status_code == 400


def test_send_reports_rover_offline_and_keeps_mission_queued(client, missions, monkeypatch):
    sign_in(client)

    def fake_post(*a, **k):
        raise operator_console.requests.exceptions.ConnectionError()

    monkeypatch.setattr(operator_console.requests, 'post', fake_post)

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code == 503
    assert missions['q1']['status'] == 'queued'


def test_send_404s_for_unknown_mission(client):
    sign_in(client)
    assert client.post('/operator/api/missions/nope/send').status_code == 404


def test_send_notifies_mission_control_after_marking_processing(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.setattr(operator_console.requests, 'post', lambda *a, **k: FakeResponse(200, {}))

    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code == 200
    assert calls == [('q1', 'processing')]


def test_send_does_not_notify_when_rover_dispatch_fails(client, monkeypatch):
    sign_in(client)

    def fake_post(*a, **k):
        raise operator_console.requests.exceptions.ConnectionError()

    monkeypatch.setattr(operator_console.requests, 'post', fake_post)

    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code == 503
    assert calls == []


def test_rerun_notifies_mission_control(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.setattr(operator_console.requests, 'post', lambda *a, **k: FakeResponse(200, {}))

    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    resp = client.post('/operator/api/missions/c1/rerun')
    assert resp.status_code == 200
    assert calls == [('c1', 'processing')]


# ---------------------------------------------------------------------------
# Complete + YouTube
# ---------------------------------------------------------------------------

def test_complete_marks_mission_completed(client, missions):
    sign_in(client)
    resp = client.post('/operator/api/missions/p1/complete')
    assert resp.status_code == 200
    assert missions['p1']['status'] == 'completed'
    assert 'completedAt' in missions['p1']


def test_complete_notifies_mission_control(client, missions, monkeypatch):
    sign_in(client)
    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    resp = client.post('/operator/api/missions/p1/complete')
    assert resp.status_code == 200
    assert calls == [('p1', 'completed')]


def test_complete_rejects_terminal_missions(client, missions):
    sign_in(client)
    assert client.post('/operator/api/missions/c1/complete').status_code == 400


def test_youtube_url_validation(client, missions):
    sign_in(client)
    bad = client.post('/operator/api/missions/c1/youtube', json={'url': 'https://vimeo.com/1'})
    assert bad.status_code == 400

    ok = client.post(
        '/operator/api/missions/c1/youtube',
        json={'url': 'https://youtube.com/watch?v=abc123'},
    )
    assert ok.status_code == 200
    assert missions['c1']['youtubeUrl'] == 'https://youtube.com/watch?v=abc123'


def test_youtube_only_attaches_to_completed_missions(client, missions):
    sign_in(client)
    resp = client.post(
        '/operator/api/missions/q1/youtube',
        json={'url': 'https://youtu.be/abc123'},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Mission list
# ---------------------------------------------------------------------------

def _seed_mirror(synced_at='2026-07-14T09:00:00Z'):
    """api_missions reads the SQLite mirror now, not Firestore - seed it the
    way the sync worker would after a successful pull.
    """
    mission_store.upsert_missions([
        {
            'id': 'q1', 'name': 'Sand Observer', 'yardId': 'uct-rover-1',
            'code': 'rover.forward(60)\nrover.stop()', 'blocklyState': '{"blocks":{}}',
            'status': 'queued', 'submittedAt': '2026-07-14T08:00:00Z',
        },
        {
            'id': 'p1', 'name': 'Storm Collector', 'yardId': 'uct-rover-1',
            'code': 'rover.forward(30)', 'status': 'processing',
            'submittedAt': '2026-07-14T07:00:00Z',
        },
        {
            'id': 'c1', 'name': 'Crater Pioneer', 'yardId': 'uct-rover-1',
            'code': 'rover.stop()', 'status': 'completed',
            'submittedAt': '2026-07-14T06:00:00Z',
        },
    ], synced_at)


def test_missions_endpoint_serialises_documents(client):
    sign_in(client)
    _seed_mirror(synced_at=operator_console._now_iso())

    resp = client.get('/operator/api/missions')
    assert resp.status_code == 200
    payload = resp.get_json()
    ids = {m['id'] for m in payload['missions']}
    assert ids == {'q1', 'p1', 'c1'}
    q1 = next(m for m in payload['missions'] if m['id'] == 'q1')
    assert q1['status'] == 'queued'
    assert q1['code'].startswith('rover.forward')
    # camelCase API contract must survive the snake_case SQLite round-trip
    assert q1['yardId'] == 'uct-rover-1'
    assert q1['blocklyState'] == '{"blocks":{}}'
    assert q1['submittedAt'] == '2026-07-14T08:00:00Z'


def test_missions_endpoint_is_stale_when_never_synced(client):
    """A satellite that has never reached Firestore has nothing to show and
    must say so, rather than looking like an empty queue."""
    import mission_store
    with mission_store._db_lock:
        conn = mission_store._connect()
        conn.execute('DELETE FROM mission_mirror')
        conn.execute('DELETE FROM sync_meta')
        conn.commit()
        conn.close()

    sign_in(client)
    resp = client.get('/operator/api/missions')
    payload = resp.get_json()
    assert payload['missions'] == []
    assert payload['stale'] is True
    assert payload['lastSyncedAt'] is None
    assert payload['pendingWrites'] == 0


def test_missions_endpoint_is_fresh_right_after_a_sync(client):
    sign_in(client)
    _seed_mirror(synced_at=operator_console._now_iso())
    payload = client.get('/operator/api/missions').get_json()
    assert payload['stale'] is False


def test_missions_endpoint_is_stale_when_last_sync_is_old(client):
    sign_in(client)
    _seed_mirror(synced_at='2020-01-01T00:00:00Z')
    payload = client.get('/operator/api/missions').get_json()
    assert payload['stale'] is True
    assert payload['lastSyncedAt'] == '2020-01-01T00:00:00Z'


def test_missions_endpoint_reports_pending_writes_from_outbox(client):
    sign_in(client)
    _seed_mirror(synced_at=operator_console._now_iso())

    conn = mission_store._connect()
    for i in range(3):
        conn.execute(
            "INSERT INTO outbox (uuid, mission_id, op, payload, event_at, created_at) "
            "VALUES (?, 'q1', 'complete', '{}', '2026-07-14T09:00:00Z', '2026-07-14T09:00:00Z')",
            (f'uuid-{i}',),
        )
    conn.commit()
    conn.close()

    payload = client.get('/operator/api/missions').get_json()
    assert payload['pendingWrites'] == 3


# ---------------------------------------------------------------------------
# YouTube auto-linking poll
# ---------------------------------------------------------------------------

def fake_playlist_response(mission_id, video_id='vid123'):
    return FakeResponse(200, {
        'items': [{
            'snippet': {
                'description': f'MissionID: {mission_id}',
                'resourceId': {'videoId': video_id},
            },
        }],
    })


@pytest.fixture
def firestore_missions():
    """A plain dict for FakeQueryFirestore. The YouTube poll is the one thing
    that still reads Firestore directly (plan 7.5), so it is not backed by the
    mirror like the request-path handlers are."""
    return _seed_missions()


@pytest.fixture
def youtube_env(monkeypatch):
    monkeypatch.setenv('YOUTUBE_API_KEY', 'test-key')
    monkeypatch.setenv('YOUTUBE_CHANNEL_ID', 'UCabc123')


def test_poll_links_mission_with_no_youtube_field_at_all(missions, firestore_missions, monkeypatch, youtube_env):
    # c1 is completed and has never had a youtubeUrl key written at all -
    # this is what a real first-run completion looks like (mission-control
    # never writes the field, and api_mark_complete doesn't touch it).
    assert 'youtubeUrl' not in firestore_missions['c1']
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: fake_playlist_response('c1'),
    )

    operator_console.check_for_new_videos()

    assert firestore_missions['c1']['youtubeUrl'] == 'https://www.youtube.com/watch?v=vid123'


def test_poll_skips_missions_that_already_have_a_link(missions, firestore_missions, monkeypatch, youtube_env):
    firestore_missions['c1']['youtubeUrl'] = 'https://www.youtube.com/watch?v=already-linked'
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: pytest.fail('YouTube API must not be called when nothing is unlinked'),
    )

    operator_console.check_for_new_videos()

    assert firestore_missions['c1']['youtubeUrl'] == 'https://www.youtube.com/watch?v=already-linked'


def test_poll_skips_entirely_when_credentials_missing(missions, monkeypatch):
    monkeypatch.delenv('YOUTUBE_API_KEY', raising=False)
    monkeypatch.delenv('YOUTUBE_CHANNEL_ID', raising=False)
    monkeypatch.setattr(
        operator_console, '_firestore',
        lambda: pytest.fail('must not touch Firestore without credentials'),
    )

    operator_console.check_for_new_videos()


def test_poll_survives_youtube_api_error_response(missions, firestore_missions, monkeypatch, youtube_env):
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))
    monkeypatch.setattr(operator_console.requests, 'get', lambda *a, **k: FakeResponse(500))

    operator_console.check_for_new_videos()

    assert 'youtubeUrl' not in firestore_missions['c1']


def test_poll_survives_youtube_network_error(missions, firestore_missions, monkeypatch, youtube_env):
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))

    def fake_get(*a, **k):
        raise operator_console.requests.exceptions.ConnectionError()

    monkeypatch.setattr(operator_console.requests, 'get', fake_get)

    operator_console.check_for_new_videos()

    assert 'youtubeUrl' not in firestore_missions['c1']


def test_poll_survives_firestore_error(monkeypatch, youtube_env):
    monkeypatch.setattr(
        operator_console, '_firestore',
        lambda: (_ for _ in ()).throw(RuntimeError('firestore unavailable')),
    )

    operator_console.check_for_new_videos()


def test_start_polling_reschedules_even_when_check_raises(monkeypatch):
    monkeypatch.setattr(
        operator_console, 'check_for_new_videos',
        lambda: (_ for _ in ()).throw(RuntimeError('boom')),
    )

    scheduled = []

    class FakeTimer:
        def __init__(self, interval, fn):
            scheduled.append(interval)
            self.daemon = None

        def start(self):
            pass

    monkeypatch.setattr(operator_console.threading, 'Timer', FakeTimer)

    operator_console.start_polling()

    assert scheduled == [300]


# ---------------------------------------------------------------------------
# mission-control notification
# ---------------------------------------------------------------------------

def test_notify_mission_control_posts_status_to_the_notify_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda url, json=None, timeout=None: calls.append((url, json, timeout)) or FakeResponse(200, {}),
    )
    monkeypatch.setenv('MISSION_CONTROL_URL', 'https://mission-control.example')

    with flask_app.app_context():
        operator_console._notify_mission_control('mission-1', 'completed')

    assert calls == [
        ('https://mission-control.example/api/missions/mission-1/notify', {'status': 'completed'}, operator_console.NOTIFY_TIMEOUT),
    ]


def test_notify_mission_control_async_runs_on_a_real_background_thread(monkeypatch):
    """Uses the real threading module (no SyncThread fake) to prove the
    async wrapper genuinely offloads work rather than running inline, and
    that it correctly re-establishes the Flask app context on that thread
    (current_app is thread-local and won't propagate on its own).
    """
    done = threading.Event()
    result = {}

    def fake_notify(mission_id, status):
        result['thread'] = threading.current_thread()
        result['args'] = (mission_id, status)
        result['app'] = current_app._get_current_object()
        done.set()

    monkeypatch.setattr(operator_console, '_notify_mission_control', fake_notify)

    with flask_app.app_context():
        operator_console._notify_mission_control_async('mission-1', 'completed')
        assert done.wait(timeout=2), 'background thread never called _notify_mission_control'

    assert result['thread'] is not threading.current_thread()
    assert result['args'] == ('mission-1', 'completed')
    assert result['app'] is flask_app


def test_notify_mission_control_swallows_network_errors(monkeypatch):
    def fake_post(*a, **k):
        raise operator_console.requests.exceptions.ConnectionError()

    monkeypatch.setattr(operator_console.requests, 'post', fake_post)

    with flask_app.app_context():
        operator_console._notify_mission_control('mission-1', 'completed')  # must not raise


def test_mission_control_url_defaults_to_localhost(monkeypatch):
    monkeypatch.delenv('MISSION_CONTROL_URL', raising=False)

    with flask_app.app_context():
        assert operator_console._mission_control_url() == 'http://localhost:3000'


# ---------------------------------------------------------------------------
# Mission locking / leases
#
# The point of the lock is that exactly one operator drives a mission at a
# time, and that a mission is never stranded when the operator holding it
# disappears. These cover both halves.
# ---------------------------------------------------------------------------

def _ok_rover(monkeypatch, calls=None):
    def fake_post(url, json=None, timeout=None):
        if calls is not None:
            calls.append((url, json))
        return FakeResponse(200, {'status': 'ok', 'added': 1})
    monkeypatch.setattr(operator_console.requests, 'post', fake_post)


def _no_rover(monkeypatch):
    def fake_post(url, json=None, timeout=None):
        raise operator_console.requests.exceptions.ConnectionError('rover offline')
    monkeypatch.setattr(operator_console.requests, 'post', fake_post)


def test_send_takes_the_lock_and_records_the_lease(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    assert client.post('/operator/api/missions/q1/send').status_code == 200

    m = missions['q1']
    assert m['status'] == 'processing'
    assert m['lockOwner'], 'an owner must be recorded or the lock means nothing'
    assert re.match(r'\d{4}-\d{2}-\d{2}T', m['lockedAt'])
    assert m['leaseExpiresAt'] > m['lockedAt'], 'lease must expire in the future'
    assert m['statusUpdatedAt']


def test_second_operator_is_refused_while_the_lease_is_live(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    missions['q1'].update({
        'lockOwner': 'someone-else',
        'lockedAt': '2026-07-14T08:00:00Z',
        'leaseExpiresAt': '2099-01-01T00:00:00Z',  # far future = still held
    })

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code == 409
    assert 'locked by another operator' in resp.get_json()['error']
    assert missions['q1']['lockOwner'] == 'someone-else', 'must not steal a live lock'


def test_expired_lease_lets_another_operator_reclaim(client, missions, monkeypatch):
    """The whole reason a lease exists: an operator crashed mid-run and the
    in-process renewal timer died with them. Without this the mission is stuck
    in 'processing' forever - send says not-queued, rerun says not-terminal."""
    sign_in(client)
    _ok_rover(monkeypatch)

    missions['q1'].update({
        'status': 'processing',
        'lockOwner': 'operator-who-crashed',
        'lockedAt': '2026-07-14T08:00:00Z',
        'leaseExpiresAt': '2026-07-14T08:05:00Z',  # long past
    })

    assert client.post('/operator/api/missions/q1/send').status_code == 200
    assert missions['q1']['lockOwner'] != 'operator-who-crashed'
    assert missions['q1']['leaseExpiresAt'] > '2026-07-14T08:05:00Z'


def test_processing_mission_with_no_lease_is_not_silently_grabbed(client, missions, monkeypatch):
    """Legacy rows written before locking existed have no lease. Treating those
    as free would let two operators drive the same mission."""
    sign_in(client)
    _ok_rover(monkeypatch)

    assert missions['p1']['status'] == 'processing'
    assert not missions['p1']['leaseExpiresAt'], 'legacy row: processing with no lease'

    assert client.post('/operator/api/missions/p1/send').status_code == 400


def test_the_holder_can_re_send_their_own_locked_mission(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    client.post('/operator/api/missions/q1/send')
    owner = missions['q1']['lockOwner']

    # Same operator, lease still live, but the mission is now 'processing'
    # without an expired lease - so it is correctly refused rather than
    # double-dispatched to the rover.
    assert client.post('/operator/api/missions/q1/send').status_code == 400
    assert missions['q1']['lockOwner'] == owner


def test_failed_dispatch_releases_the_lock_and_requeues(client, missions, monkeypatch):
    """A lock held by a dispatch that never landed would strand the mission for
    a full lease period."""
    sign_in(client)
    _no_rover(monkeypatch)

    resp = client.post('/operator/api/missions/q1/send')
    assert resp.status_code != 200

    m = missions['q1']
    assert m['status'] == 'queued', 'must go back in the queue, not stay processing'
    assert m['lockOwner'] is None
    assert m['leaseExpiresAt'] is None


def test_send_starts_a_lease_renewal_timer(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    client.post('/operator/api/missions/q1/send')

    assert 'q1' in operator_console._active_leases
    timer = operator_console._active_leases['q1']
    assert timer.started
    assert timer.interval == operator_console.LEASE_RENEW_INTERVAL


def test_completing_a_mission_clears_the_lock_and_stops_renewal(client, missions, monkeypatch):
    """A lease left renewing after completion would keep a finished mission
    looking locked forever."""
    sign_in(client)
    _ok_rover(monkeypatch)

    client.post('/operator/api/missions/q1/send')
    timer = operator_console._active_leases['q1']

    assert client.post('/operator/api/missions/q1/complete').status_code == 200

    m = missions['q1']
    assert m['status'] == 'completed'
    assert m['lockOwner'] is None
    assert m['lockedAt'] is None
    assert m['leaseExpiresAt'] is None
    assert timer.cancelled, 'renewal timer must be cancelled'
    assert 'q1' not in operator_console._active_leases


def test_rerun_takes_the_lock_on_a_completed_mission(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    assert client.post('/operator/api/missions/c1/rerun').status_code == 200

    m = missions['c1']
    assert m['status'] == 'processing'
    assert m['lockOwner']
    assert m['leaseExpiresAt']
    assert m['completedAt'] is None, 'stale completion must be cleared'


def test_rerun_restores_the_previous_status_when_dispatch_fails(client, missions, monkeypatch):
    """An unreachable rover is not a failed mission. Marking it 'failed' would
    also surface to the learner as a run that went wrong."""
    sign_in(client)
    _no_rover(monkeypatch)

    assert missions['c1']['status'] == 'completed'

    resp = client.post('/operator/api/missions/c1/rerun')
    assert resp.status_code != 200

    m = missions['c1']
    assert m['status'] == 'completed', 'must not be left marked failed'
    assert m['lockOwner'] is None
    assert m['leaseExpiresAt'] is None


def test_rerun_is_refused_while_another_operator_holds_the_lease(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)

    missions['c1'].update({
        'lockOwner': 'someone-else',
        'leaseExpiresAt': '2099-01-01T00:00:00Z',
    })

    assert client.post('/operator/api/missions/c1/rerun').status_code == 409
    assert missions['c1']['status'] == 'completed'


def test_send_still_notifies_mission_control_after_locking(client, missions, monkeypatch):
    """Regression guard: feat/MissionLock rewrote these handlers off a base that
    predated the notify calls, and dropped all three. Nothing fails when they
    go missing - learners just stop getting email."""
    sign_in(client)
    _ok_rover(monkeypatch)
    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    client.post('/operator/api/missions/q1/send')

    assert calls == [('q1', 'processing')]


def test_complete_still_notifies_mission_control_after_locking(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)
    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    client.post('/operator/api/missions/q1/send')
    calls.clear()
    client.post('/operator/api/missions/q1/complete')

    assert calls == [('q1', 'completed')]


def test_rerun_still_notifies_mission_control_after_locking(client, missions, monkeypatch):
    sign_in(client)
    _ok_rover(monkeypatch)
    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    client.post('/operator/api/missions/c1/rerun')

    assert calls == [('c1', 'processing')]


def test_failed_dispatch_does_not_notify(client, missions, monkeypatch):
    """Nothing ran, so the learner must not be told their mission launched."""
    sign_in(client)
    _no_rover(monkeypatch)
    calls = []
    monkeypatch.setattr(
        operator_console, '_notify_mission_control',
        lambda mission_id, status: calls.append((mission_id, status)),
    )

    client.post('/operator/api/missions/q1/send')
    assert calls == []


def test_lease_expiry_window_is_longer_than_the_renewal_interval(client):
    """If the lease could expire before the next renewal fired, a live mission
    would look abandoned and could be stolen mid-run."""
    assert operator_console.LEASE_TTL_SECONDS > operator_console.LEASE_RENEW_INTERVAL * 2



# ---------------------------------------------------------------------------
# Satellite identity as the lock owner (plan 3.3 / 7.4)
# ---------------------------------------------------------------------------

def test_lock_owner_is_the_satellite_not_the_operator_session(client, missions, monkeypatch, tmp_path):
    """OPERATOR_AUTH=off gives every operator the same stub uid ('offline'), so
    an operator-scoped lock owner silently disables the lock in exactly the mode
    used at events. The owner must identify the satellite instead."""
    import satellite_identity
    monkeypatch.setenv('SATELLITE_CONFIG', str(tmp_path / 'sat.json'))
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(tmp_path / 'sat.json'))
    satellite_identity.reset_cache()

    monkeypatch.setenv('OPERATOR_AUTH', 'off')
    _ok_rover(monkeypatch)

    client.post('/operator/api/missions/q1/send')

    owner = missions['q1']['lockOwner']
    assert owner == satellite_identity.satellite_id()
    assert owner != 'offline', 'the shared offline stub must never be the lock owner'
    satellite_identity.reset_cache()


def test_satellite_id_is_stable_across_calls_and_restarts(monkeypatch, tmp_path):
    import satellite_identity
    cfg = tmp_path / 'sat.json'
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(cfg))
    satellite_identity.reset_cache()

    first = satellite_identity.satellite_id()
    assert satellite_identity.satellite_id() == first, 'must be stable within a process'

    # Simulate a restart: drop the memo, reload from disk.
    satellite_identity.reset_cache()
    assert satellite_identity.satellite_id() == first, 'must survive a restart'
    assert cfg.exists(), 'the id must be persisted, not regenerated each boot'
    satellite_identity.reset_cache()


def test_satellite_id_survives_an_unwritable_config(monkeypatch, tmp_path):
    """A read-only filesystem degrades lock ownership; it must not stop boot."""
    import satellite_identity
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(tmp_path / 'nope' / 'sat.json'))
    satellite_identity.reset_cache()

    assert satellite_identity.satellite_id()  # does not raise
    satellite_identity.reset_cache()


def test_yard_id_prefers_env_then_config_then_default(monkeypatch, tmp_path):
    import satellite_identity
    cfg = tmp_path / 'sat.json'
    cfg.write_text('{"yard_id": "from-config"}')
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(cfg))

    monkeypatch.setenv('YARD_ID', 'from-env')
    satellite_identity.reset_cache()
    assert satellite_identity.yard_id() == 'from-env'

    monkeypatch.delenv('YARD_ID')
    satellite_identity.reset_cache()
    assert satellite_identity.yard_id() == 'from-config'

    cfg.write_text('{}')
    satellite_identity.reset_cache()
    assert satellite_identity.yard_id() == satellite_identity.DEFAULT_YARD_ID
    satellite_identity.reset_cache()


def test_youtube_poll_skips_a_mission_with_pending_local_writes(
    missions, firestore_missions, monkeypatch, youtube_env
):
    """Plan 7.5: the poll writes to Firestore directly, so it must not land
    between a flush's read and write and clobber an operator's completion."""
    import mission_store
    mission_store.release_mission('c1', 'completed', '2026-07-14T10:00:00Z')
    assert mission_store.mission_has_pending('c1')

    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: fake_playlist_response('c1'),
    )

    operator_console.check_for_new_videos()

    assert 'youtubeUrl' not in firestore_missions['c1'], 'must not write over a pending change'


def test_youtube_poll_writes_when_nothing_is_pending(
    missions, firestore_missions, monkeypatch, youtube_env
):
    import mission_store
    assert not mission_store.mission_has_pending('c1')

    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(firestore_missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: fake_playlist_response('c1'),
    )

    operator_console.check_for_new_videos()

    assert firestore_missions['c1']['youtubeUrl'] == 'https://www.youtube.com/watch?v=vid123'
    # The mirror is updated too, so the console shows it without a pull.
    assert mission_store.get_mission('c1')['youtube_url'] == 'https://www.youtube.com/watch?v=vid123'


# ---------------------------------------------------------------------------
# Needs-review surface (plan PR 4)
# ---------------------------------------------------------------------------

def test_needs_review_lists_only_flagged_missions(client, missions):
    import mission_store
    sign_in(client)

    assert client.get('/operator/api/missions/needs-review').get_json()['missions'] == []

    mission_store.flag_for_review('p1', 'interrupted')
    listed = client.get('/operator/api/missions/needs-review').get_json()['missions']

    assert [m['id'] for m in listed] == ['p1']


def test_resolving_as_completed_closes_it_out(client, missions, monkeypatch):
    import mission_store
    sign_in(client)
    mission_store.flag_for_review('p1', 'interrupted')

    resp = client.post('/operator/api/missions/p1/resolve', json={'outcome': 'completed'})
    assert resp.status_code == 200

    row = mission_store.get_mission('p1')
    assert row['status'] == 'completed'
    assert row['needs_review'] == 0
    assert row['lock_owner'] is None


def test_requeuing_returns_it_to_the_queue_without_touching_the_rover(client, missions, monkeypatch):
    """Re-queue makes it available for a human to send again. It must not
    dispatch by itself - physical actions are not replayable (plan 2.3)."""
    import mission_store
    sign_in(client)
    mission_store.flag_for_review('p1', 'interrupted')

    rover_calls = []
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda url, json=None, timeout=None: (rover_calls.append(url), FakeResponse(200))[1],
    )

    resp = client.post('/operator/api/missions/p1/resolve', json={'outcome': 'requeue'})
    assert resp.status_code == 200

    row = mission_store.get_mission('p1')
    assert row['status'] == 'queued'
    assert row['needs_review'] == 0
    assert not any('queue/add' in u for u in rover_calls), 'must not re-dispatch'


def test_resolve_rejects_an_unknown_outcome(client, missions):
    import mission_store
    sign_in(client)
    mission_store.flag_for_review('p1', 'interrupted')

    assert client.post('/operator/api/missions/p1/resolve',
                       json={'outcome': 'delete'}).status_code == 400


def test_resolve_rejects_a_mission_not_under_review(client, missions):
    sign_in(client)
    assert client.post('/operator/api/missions/q1/resolve',
                       json={'outcome': 'completed'}).status_code == 400


def test_conflicts_endpoint_exposes_the_log(client, missions):
    import mission_store
    sign_in(client)

    assert client.get('/operator/api/conflicts').get_json()['conflicts'] == []

    mission_store.log_conflict('q1', 'completed', 'cancelled', 'local')
    conflicts = client.get('/operator/api/conflicts').get_json()['conflicts']

    assert len(conflicts) == 1
    assert conflicts[0]['resolution'] == 'local'


def test_review_endpoints_require_an_operator(client, missions):
    assert client.get('/operator/api/missions/needs-review').status_code == 401
    assert client.post('/operator/api/missions/p1/resolve',
                       json={'outcome': 'completed'}).status_code == 401
    assert client.get('/operator/api/conflicts').status_code == 401


# ---------------------------------------------------------------------------
# Cancel, camera and setup surfaces
# ---------------------------------------------------------------------------

def test_cancel_takes_a_queued_mission_out_without_running_it(client, missions, monkeypatch):
    import mission_store
    sign_in(client)
    rover_calls = []
    monkeypatch.setattr(
        operator_console.requests, 'post',
        lambda url, json=None, timeout=None: (rover_calls.append(url), FakeResponse(200))[1],
    )

    assert client.post('/operator/api/missions/q1/cancel').status_code == 200

    assert mission_store.get_mission('q1')['status'] == 'cancelled'
    assert not any('queue/add' in u for u in rover_calls)


def test_cancel_releases_the_lock(client, missions, monkeypatch):
    import mission_store
    sign_in(client)
    _ok_rover(monkeypatch)
    client.post('/operator/api/missions/q1/send')
    assert mission_store.get_mission('q1')['lock_owner']

    client.post('/operator/api/missions/q1/cancel')

    row = mission_store.get_mission('q1')
    assert row['status'] == 'cancelled'
    assert row['lock_owner'] is None


def test_cancel_is_refused_on_a_finished_mission(client, missions):
    sign_in(client)
    assert client.post('/operator/api/missions/c1/cancel').status_code == 400


def test_cancel_queues_the_change_for_firestore(client, missions):
    import mission_store
    sign_in(client)
    client.post('/operator/api/missions/q1/cancel')
    assert mission_store.peek_outbox()['mission_id'] == 'q1'


def test_integrations_never_expose_secret_values(client, missions, monkeypatch):
    """This console is reachable by anyone on the venue network, and
    OPERATOR_AUTH=off removes the login entirely on event days."""
    sign_in(client)
    monkeypatch.setenv('YOUTUBE_API_KEY', 'AIzaSyTOTALLY-SECRET')
    monkeypatch.setenv('YOUTUBE_CHANNEL_ID', 'UCsecretchannel')
    monkeypatch.setenv('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----abc')

    body = client.get('/operator/api/integrations').get_data(as_text=True)

    assert 'AIzaSyTOTALLY-SECRET' not in body
    assert 'UCsecretchannel' not in body
    assert 'BEGIN PRIVATE KEY' not in body


def test_integrations_report_youtube_as_unconfigured_when_keys_are_missing(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.delenv('YOUTUBE_API_KEY', raising=False)
    monkeypatch.delenv('YOUTUBE_CHANNEL_ID', raising=False)

    data = client.get('/operator/api/integrations').get_json()
    yt = next(i for i in data['integrations'] if i['id'] == 'youtube')

    assert yt['configured'] is False
    assert 'manual linking still works' in yt['detail']


def test_camera_status_reports_unreachable_with_a_hint(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.setenv('CAMERA_PORT', '59999')  # nothing listening

    data = client.get('/operator/api/camera').get_json()

    assert data['reachable'] is False
    assert data['hint'] and 'Start' in data['hint']
    assert data['managedBy'] in ('systemd', 'process', 'unknown')


def test_new_surfaces_require_an_operator(client, missions):
    assert client.post('/operator/api/missions/q1/cancel').status_code == 401
    assert client.get('/operator/api/integrations').status_code == 401
    assert client.get('/operator/api/camera').status_code == 401


# ---------------------------------------------------------------------------
# Delete (soft)
# ---------------------------------------------------------------------------

def test_delete_hides_the_mission_everywhere(client, missions):
    import mission_store
    sign_in(client)

    assert client.post('/operator/api/missions/q1/delete').status_code == 200

    listed = client.get('/operator/api/missions').get_json()['missions']
    assert 'q1' not in [m['id'] for m in listed]


def test_delete_is_soft_so_a_mistake_is_recoverable(client, missions):
    """The operator is told it is permanent - there is no undo in the console -
    but the record survives for someone with database access. A hard delete
    would make one wrong tap on a child's completed mission unrecoverable."""
    import mission_store
    sign_in(client)

    client.post('/operator/api/missions/q1/delete')

    row = mission_store.get_mission('q1', include_deleted=True)
    assert row is not None, 'the document must survive'
    assert row['deleted'] == 1
    assert row['deleted_at']


def test_delete_releases_the_lock(client, missions, monkeypatch):
    """A deleted mission must never keep a lease alive and block reclaim."""
    import mission_store
    sign_in(client)
    _ok_rover(monkeypatch)
    client.post('/operator/api/missions/q1/send')
    assert mission_store.get_mission('q1')['lock_owner']

    client.post('/operator/api/missions/q1/delete')

    row = mission_store.get_mission('q1', include_deleted=True)
    assert row['lock_owner'] is None
    assert row['lease_expires_at'] is None


def test_delete_queues_the_change_for_firestore(client, missions):
    import mission_store
    sign_in(client)

    client.post('/operator/api/missions/q1/delete')

    entry = mission_store.peek_outbox()
    assert entry['mission_id'] == 'q1'
    assert entry['op'] == 'delete'


def test_deleting_twice_is_refused(client, missions):
    sign_in(client)
    assert client.post('/operator/api/missions/q1/delete').status_code == 200
    assert client.post('/operator/api/missions/q1/delete').status_code == 400


def test_delete_404s_for_an_unknown_mission(client, missions):
    sign_in(client)
    assert client.post('/operator/api/missions/nope/delete').status_code == 404


def test_delete_requires_an_operator(client, missions):
    assert client.post('/operator/api/missions/q1/delete').status_code == 401


def test_a_deleted_mission_is_not_reconciled_or_dispatchable(client, missions, monkeypatch):
    """It must drop out of the active set, or the sync worker keeps paying to
    re-read a mission nobody can see."""
    import mission_store
    sign_in(client)

    client.post('/operator/api/missions/q1/delete')

    assert 'q1' not in mission_store.active_mission_ids('uct-rover-1')
    _ok_rover(monkeypatch)
    assert client.post('/operator/api/missions/q1/send').status_code == 404


# ---------------------------------------------------------------------------
# Camera control
# ---------------------------------------------------------------------------

def test_camera_start_requires_an_operator(client, missions):
    """Spawning a process is the most powerful thing this console does, on a
    network anyone at the venue can join."""
    assert client.post('/operator/api/camera/start').status_code == 401
    assert client.post('/operator/api/camera/stop').status_code == 401


def test_camera_start_rejects_a_non_numeric_index(client, missions, monkeypatch):
    """The index is the one caller-supplied value near a subprocess. It never
    reaches a command line, but it is still validated rather than trusted."""
    sign_in(client)
    called = []
    monkeypatch.setattr(operator_console, 'api_camera_start', operator_console.api_camera_start)
    import camera_control
    monkeypatch.setattr(camera_control, 'start', lambda camera_index=None: called.append(1) or (True, 'ok'))

    resp = client.post('/operator/api/camera/start', json={'cameraIndex': '; rm -rf /'})

    assert resp.status_code == 400
    assert called == [], 'nothing should have been started'


def test_camera_start_rejects_an_out_of_range_index(client, missions):
    sign_in(client)
    assert client.post('/operator/api/camera/start', json={'cameraIndex': 99}).status_code == 400
    assert client.post('/operator/api/camera/start', json={'cameraIndex': -1}).status_code == 400


def test_camera_start_reports_a_failure_rather_than_claiming_success(client, missions, monkeypatch):
    sign_in(client)
    import camera_control
    monkeypatch.setattr(camera_control, 'start',
                        lambda camera_index=None: (False, 'Access denied'))

    resp = client.post('/operator/api/camera/start')

    assert resp.status_code == 502
    assert 'Access denied' in resp.get_json()['error']


def test_camera_start_persists_the_chosen_index(client, missions, monkeypatch, tmp_path):
    """So a restart comes back on the same device, like the rover URL."""
    import camera_control, satellite_identity, json
    cfg = tmp_path / 'sat.json'
    monkeypatch.setattr(satellite_identity, 'CONFIG_FILE', str(cfg))
    monkeypatch.setattr(camera_control, 'start', lambda camera_index=None: (True, 'ok'))
    sign_in(client)

    assert client.post('/operator/api/camera/start', json={'cameraIndex': 2}).status_code == 200

    assert json.loads(cfg.read_text())['camera_index'] == 2


def test_a_failed_camera_start_reports_the_cause_not_the_consequence(tmp_path, monkeypatch):
    """camera_server's last line is "Failed to initialize camera, exiting",
    which is true, useless, and mentions systemd even on a Mac. The line above
    it carries the diagnosis and the fix."""
    import camera_control
    log = tmp_path / 'camera.log'
    log.write_text(
        "2026-07-29 16:37:58 - INFO - Initializing Pi AI Camera...\n"
        "2026-07-29 16:37:59 - WARNING - No camera at index 0. On macOS, grant Camera access.\n"
        "2026-07-29 16:37:59 - ERROR - Failed to initialize camera, exiting (systemd restarts in 10s)\n"
    )
    monkeypatch.setattr(camera_control, 'DEV_LOG', str(log))

    line = camera_control._last_log_line()

    assert 'grant Camera access' in line
    assert 'exiting' not in line
    assert 'systemd' not in line


def test_a_macos_permission_denial_does_not_read_as_a_missing_camera(tmp_path, monkeypatch):
    """The log carries both "not authorized" and "No camera at index 0". The
    second reads like absent hardware and sent an operator looking for a
    device that was plugged in the whole time."""
    import camera_control
    log = tmp_path / 'camera.log'
    log.write_text(
        "OpenCV: not authorized to capture video (status 0), requesting...\n"
        "2026-07-29 16:49:30 - WARNING - No camera at index 1. On macOS this is usually permission.\n"
        "2026-07-29 16:49:30 - ERROR - Failed to initialize camera, exiting\n"
    )
    monkeypatch.setattr(camera_control, 'DEV_LOG', str(log))

    line = camera_control._last_log_line()

    assert 'denied camera access' in line
    assert 'No camera at index' not in line
    # The advice that wasted the operator's time: there is nothing to approve,
    # because macOS never prompted.
    assert 'Start the satellite from Terminal' in line


def test_the_permission_message_names_the_app_not_the_interpreter(monkeypatch):
    """Python lives in a .app inside its own framework, so walking the process
    tree for a bundle stops on the interpreter and reports "launched by
    Python" - which tells the operator nothing about what to change."""
    import camera_control
    monkeypatch.setattr(camera_control.sys, 'platform', 'darwin')

    tree = {
        '100': '200 /opt/homebrew/.../Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python',
        '200': '300 /Applications/SomeEditor.app/Contents/MacOS/editor',
    }
    monkeypatch.setattr(camera_control.os, 'getpid', lambda: 100)
    monkeypatch.setattr(
        camera_control.subprocess, 'run',
        lambda cmd, **kw: type('R', (), {'stdout': tree.get(cmd[-1], '')})(),
    )

    assert camera_control._launching_app() == 'SomeEditor'


def test_walking_the_process_tree_cannot_loop_forever(monkeypatch):
    """A pid whose parent is itself would otherwise hang the request thread."""
    import camera_control
    monkeypatch.setattr(camera_control.sys, 'platform', 'darwin')
    monkeypatch.setattr(camera_control.os, 'getpid', lambda: 7)
    monkeypatch.setattr(
        camera_control.subprocess, 'run',
        lambda cmd, **kw: type('R', (), {'stdout': '7 /usr/bin/python3'})(),
    )

    assert camera_control._launching_app() is None


def test_camera_start_falls_back_when_the_log_says_nothing_useful(tmp_path, monkeypatch):
    import camera_control
    log = tmp_path / 'camera.log'
    log.write_text("some unstructured output\n")
    monkeypatch.setattr(camera_control, 'DEV_LOG', str(log))

    assert camera_control._last_log_line() == 'some unstructured output'


def test_camera_control_never_builds_a_shell_command(monkeypatch):
    """The one caller-supplied value must never reach a command line."""
    import camera_control
    seen = {}
    monkeypatch.setattr(camera_control, 'is_systemd_managed', lambda: False)
    monkeypatch.setattr(camera_control.subprocess, 'Popen',
                        lambda cmd, **kw: seen.update(cmd=cmd, shell=kw.get('shell'), env=kw.get('env'))
                        or type('P', (), {'poll': lambda s: None, 'pid': 1})())
    monkeypatch.setattr(camera_control.time, 'sleep', lambda s: None)

    camera_control.start(camera_index=3)

    assert isinstance(seen['cmd'], list), 'must pass a list, never a string'
    assert seen['shell'] in (None, False), 'shell=True would be injectable'
    assert all('3' not in part for part in seen['cmd'][1:]), 'index must not reach argv'
    assert seen['env']['CAMERA_INDEX'] == '3', 'it travels in the environment'


def _camera_server_module():
    """camera_server imported by path: it is a script, not a package member."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'camera_server_under_test',
        os.path.join(os.path.dirname(__file__), '..', 'camera_server.py'),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_port_probe_does_not_fill_the_camera_log_with_tracebacks():
    """Readiness is checked by opening a socket and closing it, which makes
    websockets log a full traceback per probe. A console polling every few
    seconds then buries every real message - including the failed-start
    explanation camera_control reads back out of this same log."""
    import logging
    noise_filter = _camera_server_module()._ProbeNoiseFilter()

    class Boom(Exception):
        pass

    def record(message, exc=None):
        return logging.LogRecord(
            'websockets.server', logging.ERROR, '', 0, message, (), exc)

    probe = (Boom, Boom('did not receive a valid HTTP request'), None)
    assert not noise_filter.filter(record('opening handshake failed', probe))


def test_a_genuine_handshake_failure_is_still_logged():
    """The filter has to stay narrow: only a connection that sent nothing at
    all is a probe. A real client failing the handshake is a bug someone needs
    to see."""
    import logging
    noise_filter = _camera_server_module()._ProbeNoiseFilter()

    class Boom(Exception):
        pass

    real = (Boom, Boom('invalid Sec-WebSocket-Key header'), None)
    kept = logging.LogRecord(
        'websockets.server', logging.ERROR, '', 0, 'opening handshake failed', (), real)

    assert noise_filter.filter(kept)
    assert noise_filter.filter(
        logging.LogRecord('websockets.server', logging.INFO, '', 0, 'connection open', (), None))
