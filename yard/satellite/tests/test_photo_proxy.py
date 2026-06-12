"""
Tests for the /api/photo proxy route.
"""

import sys
import os
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import web_server


class FakePhotoResponse:
    def __init__(self, content=b'\xff\xd8jpegbytes', status_code=200,
                 content_type='image/jpeg'):
        self.content = content
        self.status_code = status_code
        self.headers = {'Content-Type': content_type}


@pytest.fixture
def client():
    web_server.app.config['TESTING'] = True
    with web_server.app.test_client() as client:
        yield client


def test_photo_proxied(client, monkeypatch):
    monkeypatch.setattr(web_server.requests, 'get',
                        lambda url, **kw: FakePhotoResponse())
    resp = client.get('/api/photo')

    assert resp.status_code == 200
    assert resp.content_type == 'image/jpeg'
    assert resp.data.startswith(b'\xff\xd8')
    assert resp.headers['Cache-Control'] == 'no-cache'


def test_photo_404_passed_through(client, monkeypatch):
    monkeypatch.setattr(web_server.requests, 'get',
                        lambda url, **kw: FakePhotoResponse(
                            content=b'{"error": "No photo taken yet"}',
                            status_code=404, content_type='application/json'))
    resp = client.get('/api/photo')

    assert resp.status_code == 404


def test_photo_rover_unreachable(client, monkeypatch):
    def fake_get(url, **kw):
        raise requests.exceptions.ConnectionError('refused')

    monkeypatch.setattr(web_server.requests, 'get', fake_get)
    resp = client.get('/api/photo')

    assert resp.status_code == 503
