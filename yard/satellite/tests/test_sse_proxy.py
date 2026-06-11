"""
Tests for the SSE proxy route /api/queue/events.

Plain pytest (no Playwright) — the rover side is faked by monkeypatching
requests.get, so these verify the proxy's timeout and mid-stream failure
handling without a real rover.
"""

import sys
import os
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import web_server


class FakeRoverResponse:
    """Stands in for the streaming requests.Response from the rover."""

    def __init__(self, chunks, error=None):
        self._chunks = chunks
        self._error = error
        self.closed = False

    def iter_content(self, chunk_size=None):
        for chunk in self._chunks:
            yield chunk
        if self._error is not None:
            raise self._error

    def close(self):
        self.closed = True


@pytest.fixture
def client():
    web_server.app.config['TESTING'] = True
    with web_server.app.test_client() as client:
        yield client


def test_proxy_uses_read_timeout(client, monkeypatch):
    """The rover request must carry a (connect, read) timeout, not None"""
    captured = {}

    def fake_get(url, **kwargs):
        captured.update(kwargs)
        return FakeRoverResponse([b'data: {}\n\n'])

    monkeypatch.setattr(web_server.requests, 'get', fake_get)
    resp = client.get('/api/queue/events')
    resp.get_data()

    assert captured['timeout'] == (3.05, 45)


def test_stream_ends_cleanly_on_midstream_error(client, monkeypatch):
    """A rover death mid-stream ends the response instead of hanging"""
    rover_resp = FakeRoverResponse(
        [b'data: {"pending_count": 0}\n\n'],
        error=requests.exceptions.ChunkedEncodingError('rover died'),
    )
    monkeypatch.setattr(web_server.requests, 'get', lambda url, **kw: rover_resp)

    resp = client.get('/api/queue/events')
    body = resp.get_data()

    assert resp.status_code == 200
    assert b'pending_count' in body
    assert rover_resp.closed is True


def test_stream_ends_cleanly_on_read_timeout(client, monkeypatch):
    """A read timeout (no heartbeat for 45s) ends the response"""
    rover_resp = FakeRoverResponse(
        [b': heartbeat\n\n'],
        error=requests.exceptions.ReadTimeout('no data'),
    )
    monkeypatch.setattr(web_server.requests, 'get', lambda url, **kw: rover_resp)

    resp = client.get('/api/queue/events')
    body = resp.get_data()

    assert resp.status_code == 200
    assert b'heartbeat' in body
    assert rover_resp.closed is True


def test_rover_unreachable_returns_503(client, monkeypatch):
    def fake_get(url, **kwargs):
        raise requests.exceptions.ConnectionError('refused')

    monkeypatch.setattr(web_server.requests, 'get', fake_get)
    resp = client.get('/api/queue/events')

    assert resp.status_code == 503


def test_rover_connect_timeout_returns_503(client, monkeypatch):
    def fake_get(url, **kwargs):
        raise requests.exceptions.ConnectTimeout('slow')

    monkeypatch.setattr(web_server.requests, 'get', fake_get)
    resp = client.get('/api/queue/events')

    assert resp.status_code == 503
