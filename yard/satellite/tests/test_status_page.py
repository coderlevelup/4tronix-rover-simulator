import threading
import time
import json
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from web_server import app as flask_app
from playwright.sync_api import Page

PORT = 15050


@pytest.fixture(scope='session', autouse=True)
def live_server():
    t = threading.Thread(
        target=lambda: flask_app.run(port=PORT, use_reloader=False, threaded=True),
        daemon=True,
    )
    t.start()
    time.sleep(1)
    return f'http://localhost:{PORT}'


def mock_status(page, satellite=None, rover=None, camera=None):
    payload = {
        'satellite': satellite or {'hostname': 'testhost', 'ip': '1.2.3.4'},
        'rover': rover or {'reachable': False, 'driver': None, 'queue_size': None, 'url': 'http://x'},
        'camera': camera or {'reachable': False, 'port': 8890},
    }
    page.route('**/api/status', lambda route: route.fulfill(
        status=200, content_type='application/json', body=json.dumps(payload)
    ))


def wait_for_badge(page, name):
    page.wait_for_function(
        f"!document.getElementById('badge-{name}').className.includes('grey')"
    )


def test_satellite_always_green(page: Page, live_server):
    mock_status(page)
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'satellite')
    assert 'green' in page.locator('#badge-satellite').get_attribute('class')
    assert page.locator('#label-satellite').text_content() == 'OK'


def test_rover_green(page: Page, live_server):
    mock_status(page, rover={
        'reachable': True, 'driver': 'RealRoverDriver', 'queue_size': 0, 'url': 'http://x'
    })
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'rover')
    assert 'green' in page.locator('#badge-rover').get_attribute('class')
    assert page.locator('#label-rover').text_content() == 'OK'


def test_rover_amber_mock_driver(page: Page, live_server):
    mock_status(page, rover={
        'reachable': True, 'driver': 'MockRoverDriver', 'queue_size': 0, 'url': 'http://x'
    })
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'rover')
    assert 'amber' in page.locator('#badge-rover').get_attribute('class')
    assert 'Mock' in page.locator('#label-rover').text_content()


def test_rover_red_unreachable(page: Page, live_server):
    mock_status(page, rover={
        'reachable': False, 'driver': None, 'queue_size': None, 'url': 'http://x'
    })
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'rover')
    assert 'red' in page.locator('#badge-rover').get_attribute('class')
    assert page.locator('#label-rover').text_content() == 'Unreachable'


def test_camera_green(page: Page, live_server):
    mock_status(page, camera={'reachable': True, 'port': 8890})
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'camera')
    assert 'green' in page.locator('#badge-camera').get_attribute('class')
    assert page.locator('#label-camera').text_content() == 'OK'


def test_camera_red(page: Page, live_server):
    mock_status(page, camera={'reachable': False, 'port': 8890})
    page.goto(f'{live_server}/status')
    wait_for_badge(page, 'camera')
    assert 'red' in page.locator('#badge-camera').get_attribute('class')
    assert page.locator('#label-camera').text_content() == 'Port closed'
