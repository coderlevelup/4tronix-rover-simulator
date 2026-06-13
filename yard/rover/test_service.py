"""
Unit Tests for RoverQueueService

These tests run fast - no HTTP, no real hardware.
Tests the core queue logic directly.
"""

import time
import pytest
from datetime import datetime
from unittest.mock import MagicMock, call

from drivers import FakeRoverDriver
from service import RoverQueueService


class TestRoverQueueService:
    """Unit tests for queue service logic"""

    def setup_method(self):
        """Set up test fixtures"""
        self.driver = FakeRoverDriver()
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

        assert result['driver'] == 'FakeRoverDriver'

    def test_health_degraded_without_processor(self):
        """Health reports degraded when the processor thread isn't running"""
        result = self.service.get_health()

        assert result['status'] == 'degraded'
        assert result['processor_alive'] is False

    def test_health_ok_when_processor_running(self):
        """Health reports ok while the processor thread is alive"""
        self.service.start_processor()

        result = self.service.get_health()

        assert result['status'] == 'ok'
        assert result['processor_alive'] is True

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
        """Set up test fixtures with fake driver"""
        self.driver = FakeRoverDriver()
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
        """Set up with tracking fake driver"""
        self.driver = FakeRoverDriver()
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


class TestRunPython:
    """Tests for run_python instruction execution"""

    def setup_method(self):
        self.driver = FakeRoverDriver()
        self.calls = []
        self.driver.forward = lambda s: self.calls.append(('forward', s))
        self.driver.reverse = lambda s: self.calls.append(('reverse', s))
        self.driver.spin_left = lambda s: self.calls.append(('spin_left', s))
        self.driver.spin_right = lambda s: self.calls.append(('spin_right', s))
        self.driver.stop = lambda: self.calls.append(('stop',))

        # Inject a rover shim that routes calls through the tracked driver
        driver = self.driver
        calls = self.calls
        class _TestRover:
            def forward(self, s): driver.forward(s)
            def reverse(self, s): driver.reverse(s)
            def spinLeft(self, s): driver.spin_left(s)
            def spinRight(self, s): driver.spin_right(s)
            def stop(self): driver.stop()
            def setServo(self, pin, angle): calls.append(('setServo', pin, angle))

        self.service = RoverQueueService(driver=self.driver, rover_module=_TestRover())

    def teardown_method(self):
        self.service.cleanup()

    def _run(self, code, wait=0.5):
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': code}}
        ])
        self.service.start_processor()
        time.sleep(wait)

    def test_run_python_forward_stop(self):
        """run_python can call rover.forward and rover.stop"""
        self._run("rover.forward(60)\nrover.stop()\n")

        assert ('forward', 60) in self.calls
        assert ('stop',) in self.calls

    def test_run_python_with_loop(self):
        """run_python executes loops correctly"""
        self._run(
            "for i in range(3):\n"
            "    rover.forward(60)\n"
            "    rover.stop()\n",
            wait=0.5
        )

        forward_calls = [c for c in self.calls if c == ('forward', 60)]
        assert len(forward_calls) == 3

    def test_run_python_with_sleep(self):
        """run_python time.sleep actually delays execution"""
        self._run(
            "rover.forward(60)\n"
            "time.sleep(0.2)\n"
            "rover.stop()\n",
            wait=0.5
        )

        assert ('forward', 60) in self.calls
        assert ('stop',) in self.calls

    def test_run_python_completes_in_history(self):
        """run_python instruction moves to history as completed"""
        self._run("rover.stop()\n")

        status = self.service.get_status()
        assert status['history_count'] == 1
        assert status['history'][0]['cmd'] == 'run_python'
        assert status['history'][0]['status'] == 'completed'

    def test_run_python_error_captured(self):
        """run_python syntax/runtime errors are captured in history"""
        self._run("rover.nonexistent_method()\n")

        status = self.service.get_status()
        assert status['history'][0]['status'] == 'error'
        assert 'error' in status['history'][0]

    def test_run_python_empty_code(self):
        """run_python with empty code completes without error"""
        self._run("")

        status = self.service.get_status()
        assert status['history'][0]['status'] == 'completed'

    def test_run_python_builtins_available(self):
        """range, len, print and other safe builtins work"""
        self._run(
            "items = list(range(3))\n"
            "for i in items:\n"
            "    rover.forward(i + 1)\n",
            wait=0.5
        )

        assert ('forward', 1) in self.calls
        assert ('forward', 2) in self.calls
        assert ('forward', 3) in self.calls


class TestRunPythonOutput:
    """Tests for stdout capture and take_photo in run_python"""

    def setup_method(self):
        self.driver = FakeRoverDriver()
        self.photos = []

        class _TestRover:
            def stop(self): pass
            def getDistance(self): return 42.0

        self.service = RoverQueueService(
            driver=self.driver,
            rover_module=_TestRover(),
            photo_provider=lambda: self.photos.append('snap') or '/tmp/test.jpg'
        )

    def teardown_method(self):
        self.service.cleanup()

    def _run(self, code, wait=0.5):
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': code}}
        ])
        self.service.start_processor()
        time.sleep(wait)
        return self.service.get_status()

    def test_print_output_captured(self):
        """print() output lands in the instruction record"""
        status = self._run("print('Distance: ' + str(round(rover.getDistance())) + ' cm')\n")

        assert status['history'][0]['status'] == 'completed'
        assert status['history'][0]['output'] == 'Distance: 42 cm'

    def test_no_output_key_when_silent(self):
        """Instructions that print nothing don't get an output field"""
        status = self._run("rover.stop()\n")

        assert 'output' not in status['history'][0]

    def test_output_captured_even_on_error(self):
        """Output printed before a crash is preserved"""
        status = self._run("print('before')\nrover.no_such_method()\n")

        assert status['history'][0]['status'] == 'error'
        assert status['history'][0]['output'] == 'before'

    def test_take_photo_calls_provider_and_marks_instruction(self):
        status = self._run("take_photo()\n")

        assert self.photos == ['snap']
        assert status['history'][0]['photo'] is True
        assert status['history'][0]['photo_attempted'] is True
        assert 'Photo taken' in status['history'][0]['output']

    def test_photo_provider_failure_is_instruction_error(self):
        def boom():
            raise RuntimeError('no camera detected')

        self.service._photo_provider = boom
        status = self._run("take_photo()\n")

        instr = status['history'][0]
        assert instr['status'] == 'error'
        assert 'no camera' in instr['error']
        # photo_attempted set but photo not — lets the monitor show a
        # "photo failed" placeholder where the picture would have been
        assert instr['photo_attempted'] is True
        assert 'photo' not in instr


class TestRunPythonInterrupt:
    """Tests for trace-based interruption of runaway run_python code"""

    def setup_method(self):
        self.driver = FakeRoverDriver()
        self.calls = []
        self.driver.stop = lambda: self.calls.append(('stop',))

        class _TestRover:
            def stop(self): pass

        self.rover_module = _TestRover()

    def teardown_method(self):
        self.service.cleanup()

    def _make_service(self, timeout=120.0):
        self.service = RoverQueueService(
            driver=self.driver,
            rover_module=self.rover_module,
            run_python_timeout=timeout
        )
        return self.service

    def _wait_for_history(self, count=1, timeout=3.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self.service.get_status()
            if status['history_count'] >= count:
                return status
            time.sleep(0.05)
        return self.service.get_status()

    def test_infinite_loop_interrupted_by_stop(self):
        """Stop button (clear_queue) breaks out of `while True: pass`"""
        self._make_service()
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': 'while True:\n    pass\n'}}
        ])
        self.service.start_processor()
        time.sleep(0.2)  # Let the loop start spinning

        self.service.clear_queue()
        status = self._wait_for_history()

        assert status['history_count'] == 1
        assert status['history'][0]['status'] == 'error'
        assert 'Stopped' in status['history'][0]['error']

    def test_infinite_loop_killed_by_deadline(self):
        """Wall-clock timeout terminates an infinite loop on its own"""
        self._make_service(timeout=0.3)
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': 'while True:\n    pass\n'}}
        ])
        self.service.start_processor()

        status = self._wait_for_history()

        assert status['history_count'] == 1
        assert status['history'][0]['status'] == 'error'
        assert 'longer than' in status['history'][0]['error']

    def test_processor_survives_interrupt(self):
        """Queue keeps processing after an interrupted instruction"""
        self._make_service(timeout=0.3)
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': 'while True:\n    pass\n'}}
        ])
        self.service.start_processor()
        self._wait_for_history(count=1)

        self.service.add_instructions([{'cmd': 'stop', 'params': {}}])
        status = self._wait_for_history(count=2)

        assert status['history_count'] == 2
        assert status['history'][1]['cmd'] == 'stop'
        assert status['history'][1]['status'] == 'completed'

    def test_normal_code_unaffected_by_trace(self):
        """Well-behaved code still completes under the trace"""
        self._make_service()
        self.service.add_instructions([
            {'cmd': 'run_python', 'params': {'code': 'total = 0\nfor i in range(100):\n    total = total + i\n'}}
        ])
        self.service.start_processor()

        status = self._wait_for_history()

        assert status['history'][0]['status'] == 'completed'


class TestProcessorResilience:
    """Tests that the processor thread survives unexpected exceptions"""

    def setup_method(self):
        self.driver = FakeRoverDriver()
        self.service = RoverQueueService(driver=self.driver)

    def teardown_method(self):
        self.service.cleanup()

    def test_processor_survives_unexpected_exception(self):
        """An exception escaping instruction handling doesn't kill the thread"""
        original = self.service._execute_instruction
        state = {'raised': False}

        def flaky(instruction):
            if not state['raised']:
                state['raised'] = True
                raise RuntimeError('unexpected internal failure')
            original(instruction)

        self.service._execute_instruction = flaky

        self.service.add_instructions([
            {'cmd': 'stop', 'params': {}},
            {'cmd': 'stop', 'params': {}}
        ])
        self.service.start_processor()

        deadline = time.time() + 3.0
        while time.time() < deadline:
            if self.service.get_status()['history_count'] >= 1:
                break
            time.sleep(0.05)

        # First instruction was eaten by the injected failure; second executed
        status = self.service.get_status()
        assert state['raised'] is True
        assert status['history_count'] == 1
        assert status['history'][0]['status'] == 'completed'
        assert self.service.get_health()['status'] == 'ok'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
