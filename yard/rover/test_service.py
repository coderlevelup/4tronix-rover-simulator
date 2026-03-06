"""
Unit Tests for RoverQueueService

These tests run fast - no HTTP, no real hardware.
Tests the core queue logic directly.
"""

import time
import pytest
from datetime import datetime
from unittest.mock import MagicMock, call

from drivers import MockRoverDriver
from service import RoverQueueService


class TestRoverQueueService:
    """Unit tests for queue service logic"""

    def setup_method(self):
        """Set up test fixtures"""
        self.driver = MockRoverDriver()
        # Use fixed time/uuid for deterministic tests
        self.fixed_time = datetime(2024, 1, 15, 12, 0, 0)
        self.uuid_counter = 0

        def fixed_uuid():
            self.uuid_counter += 1
            return f"test-uuid-{self.uuid_counter}"

        self.service = RoverQueueService(
            driver=self.driver,
            time_provider=lambda: self.fixed_time,
            uuid_provider=fixed_uuid
        )

    def teardown_method(self):
        """Clean up after each test"""
        self.service.cleanup()

    # =========================================================
    # add_instructions tests
    # =========================================================

    def test_add_single_instruction(self):
        """Adding a single instruction returns correct response"""
        result = self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 1}}
        ])

        assert result['status'] == 'ok'
        assert result['added'] == 1
        assert len(result['instructions']) == 1
        assert result['instructions'][0]['id'] == 'test-uuid-1'
        assert result['instructions'][0]['cmd'] == 'forward'
        assert result['instructions'][0]['status'] == 'pending'

    def test_add_multiple_instructions(self):
        """Adding multiple instructions queues them all"""
        result = self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 1}},
            {'cmd': 'spin_left', 'params': {'speed': 50, 'seconds': 0.5}},
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 1}}
        ])

        assert result['status'] == 'ok'
        assert result['added'] == 3
        assert len(result['instructions']) == 3

    def test_add_empty_instructions(self):
        """Adding empty list returns error"""
        result = self.service.add_instructions([])

        assert result['status'] == 'error'
        assert result['added'] == 0

    def test_add_instructions_generates_timestamps(self):
        """Instructions get timestamps from time provider"""
        result = self.service.add_instructions([
            {'cmd': 'forward', 'params': {}}
        ])

        assert result['instructions'][0]['timestamp'] == '2024-01-15T12:00:00Z'

    def test_add_instructions_default_params(self):
        """Instructions with missing params get empty dict"""
        result = self.service.add_instructions([{'cmd': 'stop'}])

        assert result['instructions'][0]['params'] == {}

    # =========================================================
    # get_status tests
    # =========================================================

    def test_status_empty_queue(self):
        """Status shows empty when nothing queued"""
        result = self.service.get_status()

        assert result['current'] is None
        assert result['pending'] == []
        assert result['pending_count'] == 0
        assert result['history'] == []
        assert result['history_count'] == 0

    def test_status_shows_pending(self):
        """Status shows pending instructions"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60}},
            {'cmd': 'spin_left', 'params': {'speed': 50}}
        ])

        result = self.service.get_status()

        assert result['pending_count'] == 2
        assert result['pending'][0]['cmd'] == 'forward'
        assert result['pending'][1]['cmd'] == 'spin_left'

    # =========================================================
    # clear_queue tests
    # =========================================================

    def test_clear_queue_stops_driver(self):
        """Clearing queue calls driver.stop()"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60}}
        ])

        # Spy on driver.stop
        stop_called = []
        original_stop = self.driver.stop
        def spy_stop():
            stop_called.append(True)
            original_stop()
        self.driver.stop = spy_stop

        self.service.clear_queue()

        assert len(stop_called) > 0

    def test_clear_queue_removes_pending(self):
        """Clearing queue removes all pending instructions"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'spin_left', 'params': {}},
            {'cmd': 'forward', 'params': {}}
        ])

        result = self.service.clear_queue()

        assert result['status'] == 'ok'
        assert result['cleared'] == 3

        status = self.service.get_status()
        assert status['pending_count'] == 0

    def test_clear_empty_queue(self):
        """Clearing empty queue succeeds with 0 cleared"""
        result = self.service.clear_queue()

        assert result['status'] == 'ok'
        assert result['cleared'] == 0

    # =========================================================
    # get_health tests
    # =========================================================

    def test_health_returns_driver_name(self):
        """Health check returns driver class name"""
        result = self.service.get_health()

        assert result['status'] == 'ok'
        assert result['driver'] == 'MockRoverDriver'

    def test_health_returns_queue_size(self):
        """Health check returns current queue size"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'spin_left', 'params': {}}
        ])

        result = self.service.get_health()

        assert result['queue_size'] == 2


class TestQueueProcessor:
    """Tests for background queue processing"""

    def setup_method(self):
        """Set up test fixtures with mock driver"""
        self.driver = MockRoverDriver()
        self.service = RoverQueueService(driver=self.driver)

    def teardown_method(self):
        """Clean up after each test"""
        self.service.cleanup()

    def test_processor_executes_instructions(self):
        """Processor executes queued instructions"""
        # Track driver calls
        calls = []
        self.driver.forward = lambda s: calls.append(('forward', s))
        self.driver.stop = lambda: calls.append(('stop',))

        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 0.1}}
        ])

        self.service.start_processor()
        time.sleep(0.3)  # Wait for execution

        assert ('forward', 60) in calls
        assert ('stop',) in calls

    def test_processor_executes_in_order(self):
        """Processor executes instructions in FIFO order"""
        calls = []
        self.driver.forward = lambda s: calls.append('forward')
        self.driver.reverse = lambda s: calls.append('reverse')
        self.driver.spin_left = lambda s: calls.append('spin_left')
        self.driver.stop = lambda: None

        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 0.05}},
            {'cmd': 'backward', 'params': {'speed': 60, 'seconds': 0.05}},
            {'cmd': 'spin_left', 'params': {'speed': 60, 'seconds': 0.05}}
        ])

        self.service.start_processor()
        time.sleep(0.5)  # Wait for all to execute

        assert calls == ['forward', 'reverse', 'spin_left']

    def test_processor_updates_history(self):
        """Completed instructions move to history"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 0.05}}
        ])

        self.service.start_processor()
        time.sleep(0.3)

        status = self.service.get_status()
        assert status['pending_count'] == 0
        assert status['history_count'] == 1
        assert status['history'][0]['status'] == 'completed'

    def test_clear_interrupts_execution(self):
        """Clear queue interrupts long-running instruction"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 5.0}},  # 5 second wait
            {'cmd': 'spin_left', 'params': {'speed': 60, 'seconds': 1.0}}
        ])

        self.service.start_processor()
        time.sleep(0.2)  # Let first instruction start

        result = self.service.clear_queue()

        assert result['cleared'] == 1  # Second instruction cleared
        time.sleep(0.2)

        status = self.service.get_status()
        assert status['pending_count'] == 0


class TestInstructionExecution:
    """Tests for individual instruction execution"""

    def setup_method(self):
        """Set up with tracking mock driver"""
        self.driver = MockRoverDriver()
        self.calls = []

        # Track all driver method calls
        self.driver.forward = lambda s: self.calls.append(('forward', s))
        self.driver.reverse = lambda s: self.calls.append(('reverse', s))
        self.driver.spin_left = lambda s: self.calls.append(('spin_left', s))
        self.driver.spin_right = lambda s: self.calls.append(('spin_right', s))
        self.driver.steer_left = lambda d, s: self.calls.append(('steer_left', d, s))
        self.driver.steer_right = lambda d, s: self.calls.append(('steer_right', d, s))
        self.driver.stop = lambda: self.calls.append(('stop',))

        self.service = RoverQueueService(driver=self.driver)

    def teardown_method(self):
        self.service.cleanup()

    def test_forward_calls_driver(self):
        """Forward instruction calls driver.forward then stop"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 75, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('forward', 75) in self.calls
        assert self.calls[-1] == ('stop',)

    def test_backward_calls_driver(self):
        """Backward instruction calls driver.reverse then stop"""
        self.service.add_instructions([
            {'cmd': 'backward', 'params': {'speed': 50, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('reverse', 50) in self.calls

    def test_spin_left_calls_driver(self):
        """Spin left instruction calls driver.spin_left"""
        self.service.add_instructions([
            {'cmd': 'spin_left', 'params': {'speed': 40, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('spin_left', 40) in self.calls

    def test_spin_right_calls_driver(self):
        """Spin right instruction calls driver.spin_right"""
        self.service.add_instructions([
            {'cmd': 'spin_right', 'params': {'speed': 40, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('spin_right', 40) in self.calls

    def test_steer_left_calls_driver(self):
        """Steer left instruction calls driver.steer_left with degrees"""
        self.service.add_instructions([
            {'cmd': 'steer_left', 'params': {'degrees': 30, 'speed': 60, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('steer_left', 30, 60) in self.calls

    def test_steer_right_calls_driver(self):
        """Steer right instruction calls driver.steer_right with degrees"""
        self.service.add_instructions([
            {'cmd': 'steer_right', 'params': {'degrees': 25, 'speed': 55, 'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('steer_right', 25, 55) in self.calls

    def test_stop_calls_driver(self):
        """Stop instruction calls driver.stop"""
        self.service.add_instructions([
            {'cmd': 'stop', 'params': {}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('stop',) in self.calls

    def test_wait_does_not_call_driver(self):
        """Wait instruction doesn't call movement methods"""
        self.service.add_instructions([
            {'cmd': 'wait', 'params': {'seconds': 0.05}}
        ])
        self.service.start_processor()
        time.sleep(0.2)

        # Should have no movement calls (only stop from cleanup might appear)
        movement_calls = [c for c in self.calls if c[0] != 'stop']
        assert movement_calls == []

    def test_default_speed(self):
        """Instructions without speed use default of 60"""
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'seconds': 0.05}}  # No speed
        ])
        self.service.start_processor()
        time.sleep(0.2)

        assert ('forward', 60) in self.calls

    def test_default_seconds(self):
        """Instructions without seconds use default of 1.0"""
        # We can't easily test timing, but we can verify it doesn't crash
        self.service.add_instructions([
            {'cmd': 'forward', 'params': {'speed': 60}}  # No seconds
        ])
        self.service.start_processor()
        time.sleep(1.3)  # Wait for default 1s + buffer

        status = self.service.get_status()
        assert status['history_count'] == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
