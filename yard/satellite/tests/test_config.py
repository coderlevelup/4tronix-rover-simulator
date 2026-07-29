"""
Tests for the runtime rover-URL config endpoint POST /api/config/rover_url.
"""

import sys
import os
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import web_server


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Test client with config writes redirected to a temp file and the
    ROVER_URL global restored afterwards."""
    monkeypatch.setattr(web_server, 'CONFIG_FILE', str(tmp_path / 'satellite_config.json'))
    original_url = web_server.ROVER_URL
    web_server.app.config['TESTING'] = True
    with web_server.app.test_client() as client:
        # Repointing the rover is now an operator action; these tests exercise
        # the endpoint's behaviour, not its gate (see the auth test below).
        with client.session_transaction() as sess:
            sess['operator'] = {'uid': 'op-1', 'email': 'op@test.com', 'role': 'operator'}
        yield client
    web_server.ROVER_URL = original_url


def test_set_rover_url(client):
    resp = client.post('/api/config/rover_url', json={'url': 'http://curiosity.local:8523'})
    data = resp.get_json()

    assert resp.status_code == 200
    assert data['rover_url'] == 'http://curiosity.local:8523'
    assert data['persisted'] is True
    assert web_server.ROVER_URL == 'http://curiosity.local:8523'


def test_set_rover_url_strips_trailing_slash(client):
    resp = client.post('/api/config/rover_url', json={'url': 'http://curiosity.local:8523/'})

    assert resp.get_json()['rover_url'] == 'http://curiosity.local:8523'


def test_set_rover_url_persists_to_config_file(client):
    client.post('/api/config/rover_url', json={'url': 'http://10.0.0.7:8523'})

    with open(web_server.CONFIG_FILE) as f:
        assert json.load(f)['rover_url'] == 'http://10.0.0.7:8523'


def test_saved_url_used_by_api_status(client, monkeypatch):
    client.post('/api/config/rover_url', json={'url': 'http://10.0.0.7:8523'})

    captured = {}

    def fake_get(url, **kwargs):
        captured['url'] = url
        raise web_server.requests.exceptions.ConnectionError('offline')

    monkeypatch.setattr(web_server.requests, 'get', fake_get)
    data = client.get('/api/status').get_json()

    assert captured['url'] == 'http://10.0.0.7:8523/health'
    assert data['rover']['url'] == 'http://10.0.0.7:8523'


@pytest.mark.parametrize('bad', ['', 'curiosity.local:8523', 'ftp://x', 'http://', None])
def test_invalid_url_rejected(client, bad):
    resp = client.post('/api/config/rover_url', json={'url': bad})

    assert resp.status_code == 400
    assert 'error' in resp.get_json()


def test_load_config_precedence(tmp_path, monkeypatch):
    """A saved config value wins over the environment default on startup"""
    cfg = tmp_path / 'satellite_config.json'
    cfg.write_text(json.dumps({'rover_url': 'http://saved.local:8523'}))
    monkeypatch.setattr(web_server, 'CONFIG_FILE', str(cfg))

    assert web_server._load_config().get('rover_url') == 'http://saved.local:8523'


def test_rover_url_cannot_be_changed_without_an_operator(tmp_path, monkeypatch):
    """Anyone on the venue network could otherwise aim this satellite at a
    different machine, or at nothing, and the console would keep reporting
    success."""
    monkeypatch.setattr(web_server, 'CONFIG_FILE', str(tmp_path / 'satellite_config.json'))
    monkeypatch.delenv('OPERATOR_AUTH', raising=False)
    original_url = web_server.ROVER_URL
    web_server.app.config['TESTING'] = True

    with web_server.app.test_client() as anon:
        resp = anon.post('/api/config/rover_url', json={'url': 'http://attacker.local:8523'})

    assert resp.status_code == 401
    assert web_server.ROVER_URL == original_url, 'the URL must not have changed'


def test_the_monitor_does_not_hardcode_the_camera_host(client):
    """The camera websocket URL was pinned to ws://mro.local:8890, so the feed
    only worked for someone reaching the Pi by that exact mDNS name. Opening
    the monitor by IP - or on any dev machine - left it dialling a host that
    does not resolve, sitting on "Connecting..." forever with nothing in the
    UI to say why."""
    page = client.get('/monitor/').get_data(as_text=True)

    assert 'mro.local:8890' not in page, 'the camera host must not be pinned'
    # Derived from wherever the page was served: the camera always runs on the
    # same machine as this web server, on the Pi and in development alike.
    assert 'window.location.hostname' in page
    assert f':{web_server.CAMERA_PORT}`' in page


def test_the_monitor_uses_the_configured_camera_port(client, monkeypatch):
    """CAMERA_PORT is env-tunable, so a page that renders 8890 regardless would
    silently ignore it."""
    monkeypatch.setattr(web_server, 'CAMERA_PORT', 9999)

    page = client.get('/monitor/').get_data(as_text=True)

    assert 'ws://${window.location.hostname}:9999' in page
