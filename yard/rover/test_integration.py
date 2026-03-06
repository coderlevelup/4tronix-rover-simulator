"""
Integration Tests for Rover Server Flask Endpoints

These tests hit the actual HTTP endpoints using Flask's test client.
Slower than unit tests but verify the full HTTP layer.
"""

import time
import pytest
from datetime import datetime

from drivers import MockRoverDriver
from service import RoverQueueService
from rover_server import app, create_app


@pytest.fixture
def client():
    """Create test client with injected mock service"""
    driver = MockRoverDriver()
    service = RoverQueueService(
        driver=driver,
        time_provider=lambda: datetime(2024, 1, 15, 12, 0, 0),
        uuid_provider=lambda: 'test-uuid'
    )

    create_app(service)
    app.config['TESTING'] = True

    with app.test_client() as client:
        yield client

    service.cleanup()


@pytest.fixture
def client_with_processor():
    """Create test client with running queue processor"""
    driver = MockRoverDriver()
    service = RoverQueueService(driver=driver)
    service.start_processor()

    create_app(service)
    app.config['TESTING'] = True

    with app.test_client() as client:
        yield client

    service.cleanup()


class TestHealthEndpoint:
    """Tests for GET /health"""

    def test_health_returns_200(self, client):
        """Health endpoint returns 200 OK"""
        response = client.get('/health')

        assert response.status_code == 200

    def test_health_returns_json(self, client):
        """Health endpoint returns JSON"""
        response = client.get('/health')

        assert response.content_type == 'application/json'

    def test_health_contains_status(self, client):
        """Health response contains status field"""
        response = client.get('/health')
        data = response.get_json()

        assert data['status'] == 'ok'

    def test_health_contains_driver(self, client):
        """Health response contains driver name"""
        response = client.get('/health')
        data = response.get_json()

        assert data['driver'] == 'MockRoverDriver'

    def test_health_contains_queue_size(self, client):
        """Health response contains queue size"""
        response = client.get('/health')
        data = response.get_json()

        assert 'queue_size' in data


class TestQueueAddEndpoint:
    """Tests for POST /queue/add"""

    def test_add_returns_200(self, client):
        """Add endpoint returns 200 on success"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {'speed': 60}}
        ])

        assert response.status_code == 200

    def test_add_returns_json(self, client):
        """Add endpoint returns JSON"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}}
        ])

        assert response.content_type == 'application/json'

    def test_add_single_instruction(self, client):
        """Add single instruction to queue"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 1}}
        ])
        data = response.get_json()

        assert data['status'] == 'ok'
        assert data['added'] == 1

    def test_add_multiple_instructions(self, client):
        """Add multiple instructions to queue"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'spin_left', 'params': {}},
            {'cmd': 'forward', 'params': {}}
        ])
        data = response.get_json()

        assert data['added'] == 3

    def test_add_returns_instruction_ids(self, client):
        """Added instructions have IDs assigned"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}}
        ])
        data = response.get_json()

        assert 'id' in data['instructions'][0]

    def test_add_returns_timestamps(self, client):
        """Added instructions have timestamps"""
        response = client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}}
        ])
        data = response.get_json()

        assert 'timestamp' in data['instructions'][0]

    def test_add_no_json_returns_error(self, client):
        """Add without JSON body returns 4xx error"""
        response = client.post('/queue/add')

        # Flask returns 415 (Unsupported Media Type) or 400 depending on version
        assert response.status_code in (400, 415)

    def test_add_empty_list_returns_400(self, client):
        """Add empty instruction list returns 400"""
        response = client.post('/queue/add', json=[])

        assert response.status_code == 400


class TestQueueStatusEndpoint:
    """Tests for GET /queue/status"""

    def test_status_returns_200(self, client):
        """Status endpoint returns 200"""
        response = client.get('/queue/status')

        assert response.status_code == 200

    def test_status_returns_json(self, client):
        """Status endpoint returns JSON"""
        response = client.get('/queue/status')

        assert response.content_type == 'application/json'

    def test_status_empty_queue(self, client):
        """Status shows empty queue"""
        response = client.get('/queue/status')
        data = response.get_json()

        assert data['current'] is None
        assert data['pending'] == []
        assert data['pending_count'] == 0

    def test_status_shows_pending(self, client):
        """Status shows pending instructions"""
        client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'spin_left', 'params': {}}
        ])

        response = client.get('/queue/status')
        data = response.get_json()

        assert data['pending_count'] == 2

    def test_status_contains_history(self, client):
        """Status response contains history field"""
        response = client.get('/queue/status')
        data = response.get_json()

        assert 'history' in data
        assert 'history_count' in data


class TestQueueClearEndpoint:
    """Tests for POST /queue/clear"""

    def test_clear_returns_200(self, client):
        """Clear endpoint returns 200"""
        response = client.post('/queue/clear')

        assert response.status_code == 200

    def test_clear_returns_json(self, client):
        """Clear endpoint returns JSON"""
        response = client.post('/queue/clear')

        assert response.content_type == 'application/json'

    def test_clear_empties_queue(self, client):
        """Clear removes all pending instructions"""
        client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'spin_left', 'params': {}},
            {'cmd': 'forward', 'params': {}}
        ])

        response = client.post('/queue/clear')
        data = response.get_json()

        assert data['status'] == 'ok'
        assert data['cleared'] == 3

    def test_clear_reports_count(self, client):
        """Clear reports number of cleared instructions"""
        client.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'forward', 'params': {}}
        ])

        response = client.post('/queue/clear')
        data = response.get_json()

        assert data['cleared'] == 2

    def test_clear_empty_queue(self, client):
        """Clear on empty queue reports 0 cleared"""
        response = client.post('/queue/clear')
        data = response.get_json()

        assert data['cleared'] == 0


class TestEndToEndFlow:
    """End-to-end tests with queue processor running"""

    def test_full_instruction_flow(self, client_with_processor):
        """Instructions flow through queue to completion"""
        # Add instructions
        client_with_processor.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 0.1}}
        ])

        # Wait for execution
        time.sleep(0.3)

        # Check status
        response = client_with_processor.get('/queue/status')
        data = response.get_json()

        assert data['pending_count'] == 0
        assert data['history_count'] >= 1

    def test_queue_processes_in_order(self, client_with_processor):
        """Queue processes instructions in FIFO order"""
        client_with_processor.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {'seconds': 0.05}},
            {'cmd': 'spin_left', 'params': {'seconds': 0.05}},
            {'cmd': 'backward', 'params': {'seconds': 0.05}}
        ])

        time.sleep(0.5)

        response = client_with_processor.get('/queue/status')
        data = response.get_json()

        # All should be completed
        assert data['history_count'] == 3

        # Check order in history
        cmds = [h['cmd'] for h in data['history']]
        assert cmds == ['forward', 'spin_left', 'backward']

    def test_clear_stops_execution(self, client_with_processor):
        """Clear interrupts currently executing instruction"""
        # Add long-running instruction
        client_with_processor.post('/queue/add', json=[
            {'cmd': 'forward', 'params': {'seconds': 5.0}},
            {'cmd': 'spin_left', 'params': {'seconds': 1.0}}
        ])

        # Wait briefly then clear
        time.sleep(0.1)
        response = client_with_processor.post('/queue/clear')
        data = response.get_json()

        assert data['cleared'] >= 1  # At least the pending one

        # Queue should be empty after clear
        time.sleep(0.2)
        status = client_with_processor.get('/queue/status').get_json()
        assert status['pending_count'] == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
