"""
Operator console tests - auth gate, login flow, and mission actions.

Firestore and the rover queue are faked; firebase-admin is never imported.
What's under test: session gating, role enforcement, the send-to-rover
dispatch, and the status transitions written back to Firestore.
"""

import sys
import os
import re

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from web_server import app as flask_app  # noqa: E402
import operator_console  # noqa: E402


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

    def get(self):
        return FakeSnapshot(self._store.get(self._id))

    def update(self, fields):
        self._store[self._id].update(fields)


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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def missions():
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
def client(missions, monkeypatch):
    # web_server.py now calls load_dotenv() on import, so a developer's real
    # local .env (OPERATOR_AUTH=off while testing at an event, a real
    # YOUTUBE_API_KEY, etc.) would otherwise leak into every test run. Start
    # every test from a clean slate; tests that care about a specific value
    # set it themselves via monkeypatch.
    for var in ('OPERATOR_AUTH', 'YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeFirestore(missions))
    monkeypatch.setattr(operator_console, '_admin_configured', lambda: True)
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
    assert payload == [{
        'cmd': 'run_python',
        'params': {
            'code': 'rover.forward(60)\nrover.stop()',
            'blockly_state': '{"blocks":{}}',
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


# ---------------------------------------------------------------------------
# Complete + YouTube
# ---------------------------------------------------------------------------

def test_complete_marks_mission_completed(client, missions):
    sign_in(client)
    resp = client.post('/operator/api/missions/p1/complete')
    assert resp.status_code == 200
    assert missions['p1']['status'] == 'completed'
    assert 'completedAt' in missions['p1']


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

def test_missions_endpoint_serialises_documents(client, missions, monkeypatch):
    sign_in(client)
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(missions))

    resp = client.get('/operator/api/missions')
    assert resp.status_code == 200
    payload = resp.get_json()
    ids = {m['id'] for m in payload['missions']}
    assert ids == {'q1', 'p1', 'c1'}
    q1 = next(m for m in payload['missions'] if m['id'] == 'q1')
    assert q1['status'] == 'queued'
    assert q1['code'].startswith('rover.forward')


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
def youtube_env(monkeypatch):
    monkeypatch.setenv('YOUTUBE_API_KEY', 'test-key')
    monkeypatch.setenv('YOUTUBE_CHANNEL_ID', 'UCabc123')


def test_poll_links_mission_with_no_youtube_field_at_all(missions, monkeypatch, youtube_env):
    # c1 is completed and has never had a youtubeUrl key written at all -
    # this is what a real first-run completion looks like (mission-control
    # never writes the field, and api_mark_complete doesn't touch it).
    assert 'youtubeUrl' not in missions['c1']
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: fake_playlist_response('c1'),
    )

    operator_console.check_for_new_videos()

    assert missions['c1']['youtubeUrl'] == 'https://www.youtube.com/watch?v=vid123'


def test_poll_skips_missions_that_already_have_a_link(missions, monkeypatch, youtube_env):
    missions['c1']['youtubeUrl'] = 'https://www.youtube.com/watch?v=already-linked'
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(missions))
    monkeypatch.setattr(
        operator_console.requests, 'get',
        lambda *a, **k: pytest.fail('YouTube API must not be called when nothing is unlinked'),
    )

    operator_console.check_for_new_videos()

    assert missions['c1']['youtubeUrl'] == 'https://www.youtube.com/watch?v=already-linked'


def test_poll_skips_entirely_when_credentials_missing(missions, monkeypatch):
    monkeypatch.delenv('YOUTUBE_API_KEY', raising=False)
    monkeypatch.delenv('YOUTUBE_CHANNEL_ID', raising=False)
    monkeypatch.setattr(
        operator_console, '_firestore',
        lambda: pytest.fail('must not touch Firestore without credentials'),
    )

    operator_console.check_for_new_videos()


def test_poll_survives_youtube_api_error_response(missions, monkeypatch, youtube_env):
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(missions))
    monkeypatch.setattr(operator_console.requests, 'get', lambda *a, **k: FakeResponse(500))

    operator_console.check_for_new_videos()

    assert 'youtubeUrl' not in missions['c1']


def test_poll_survives_youtube_network_error(missions, monkeypatch, youtube_env):
    monkeypatch.setattr(operator_console, '_firestore', lambda: FakeQueryFirestore(missions))

    def fake_get(*a, **k):
        raise operator_console.requests.exceptions.ConnectionError()

    monkeypatch.setattr(operator_console.requests, 'get', fake_get)

    operator_console.check_for_new_videos()

    assert 'youtubeUrl' not in missions['c1']


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
