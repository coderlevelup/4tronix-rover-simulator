"""
SSE Tests — subscriber fan-out and HTTP streaming endpoint

Covers:
  1. Service subscriber fan-out (unit tests, no HTTP)
  2. Rover /queue/events HTTP endpoint (integration)
  3. Stop interrupting run_python loops

NOT covered here (requires a live server):
  - Multiple concurrent browser clients — verify manually by opening
    /monitor/ in two different browsers/devices simultaneously and
    confirming both badges turn green and both receive the same events.
"""

import json
import queue
import time
import threading
import pytest
from datetime import datetime

from drivers import FakeRoverDriver
from service import RoverQueueService
from rover_server import app, create_app


# ============================================================
# Helpers
# ============================================================

def _json(q, timeout=1.0):
    """Get one item from a subscriber queue and parse it as JSON."""
    return json.loads(q.get(timeout=timeout))


def _first_sse_chunk(client, path, timeout=2.0):
    """
    Return the parsed JSON from the first SSE data: line on a streaming
    endpoint. Runs in a thread because the generator blocks after the
    initial yield.
    """
    result = []
    error = []
    done = threading.Event()

    def _read():
        try:
            resp = client.get(path)
            buf = b''
            for chunk in resp.response:
                buf += chunk
                if b'\n\n' in buf:
                    for line in buf.split(b'\n'):
                        if line.startswith(b'data: '):
                            result.append(json.loads(line[6:].strip()))
                            done.set()
                            return
        except Exception as e:
            error.append(e)
            done.set()

    t = threading.Thread(target=_read, daemon=True)
    t.start()
    done.wait(timeout=timeout)

    if error:
        raise error[0]
    return result[0] if result else None


def _collect_sse_chunks(client, path, count, trigger_fn=None, trigger_delay=0.1, timeout=3.0):
    """
    Collect `count` SSE data events from a streaming endpoint.
    Optionally calls trigger_fn after trigger_delay seconds.
    """
    events = []
    done = threading.Event()

    def _read():
        try:
            resp = client.get(path)
            buf = b''
            for chunk in resp.response:
                buf += chunk
                while b'\n\n' in buf:
                    frame, buf = buf.split(b'\n\n', 1)
                    for line in frame.split(b'\n'):
                        if line.startswith(b'data: '):
                            events.append(json.loads(line[6:].strip()))
                            if len(events) >= count:
                                done.set()
                                return
        except Exception:
            done.set()

    t = threading.Thread(target=_read, daemon=True)
    t.start()

    if trigger_fn:
        time.sleep(trigger_delay)
        trigger_fn()

    done.wait(timeout=timeout)
    return events


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def service():
    driver = FakeRoverDriver()
    svc = RoverQueueService(driver=driver)
    yield svc
    svc.cleanup()


@pytest.fixture
def service_with_processor():
    driver = FakeRoverDriver()
    svc = RoverQueueService(driver=driver)
    svc.start_processor()
    yield svc
    svc.cleanup()


@pytest.fixture
def sse_client(service):
    create_app(service)
    app.config['TESTING'] = True
    # Don't use `with` — daemon reader threads hold the Flask context open
    # past fixture teardown, causing LookupError on context cleanup.
    yield app.test_client(), service


@pytest.fixture
def sse_client_with_processor(service_with_processor):
    create_app(service_with_processor)
    app.config['TESTING'] = True
    yield app.test_client(), service_with_processor


# ============================================================
# 1. Service subscriber fan-out
# ============================================================

class TestSSESubscribers:

    def test_subscribe_returns_queue(self, service):
        q = service.subscribe()
        assert q is not None

    def test_subscribe_twice_returns_different_queues(self, service):
        q1 = service.subscribe()
        q2 = service.subscribe()
        assert q1 is not q2

    def test_add_instructions_notifies_subscriber(self, service):
        q = service.subscribe()
        service.add_instructions([{'cmd': 'forward', 'params': {}}])
        data = _json(q)
        assert data['pending_count'] == 1

    def test_clear_queue_notifies_subscriber(self, service):
        service.add_instructions([{'cmd': 'forward', 'params': {}}])
        q = service.subscribe()
        service.clear_queue()
        data = _json(q)
        assert data['pending_count'] == 0

    def test_multiple_subscribers_all_notified(self, service):
        q1 = service.subscribe()
        q2 = service.subscribe()
        service.add_instructions([{'cmd': 'forward', 'params': {}}])
        d1 = _json(q1)
        d2 = _json(q2)
        assert d1['pending_count'] == 1
        assert d2['pending_count'] == 1

    def test_unsubscribe_stops_notifications(self, service):
        q = service.subscribe()
        service.unsubscribe(q)
        service.add_instructions([{'cmd': 'forward', 'params': {}}])
        with pytest.raises(queue.Empty):
            q.get(timeout=0.2)

    def test_unsubscribe_nonexistent_does_not_raise(self, service):
        q = service.subscribe()
        service.unsubscribe(q)
        service.unsubscribe(q)  # second call must not raise

    def test_execution_notifies_executing_then_completed(self, service_with_processor):
        svc = service_with_processor
        q = svc.subscribe()

        svc.add_instructions([{'cmd': 'wait', 'params': {'seconds': 0.05}}])

        add_data = _json(q, timeout=1.0)
        assert add_data['pending_count'] == 1

        exec_data = _json(q, timeout=2.0)
        assert exec_data['current'] is not None
        assert exec_data['current']['status'] == 'executing'

        # After completion: current is None, instruction already in history
        done_data = _json(q, timeout=2.0)
        assert done_data['current'] is None
        assert done_data['history_count'] == 1
        assert done_data['history'][0]['status'] == 'completed'

    def test_error_in_instruction_notifies(self, service_with_processor):
        svc = service_with_processor

        def _raise(s):
            raise RuntimeError("hardware fault")
        svc.driver.forward = _raise

        q = svc.subscribe()
        svc.add_instructions([{'cmd': 'forward', 'params': {'seconds': 0.05}}])

        _json(q, timeout=1.0)   # add
        _json(q, timeout=2.0)   # executing
        # After error: current is None, instruction in history with status=error
        done_data = _json(q, timeout=2.0)
        assert done_data['current'] is None
        assert done_data['history_count'] == 1
        assert done_data['history'][0]['status'] == 'error'


# ============================================================
# 2. HTTP SSE endpoint
# ============================================================

class TestSSEHTTPEndpoint:

    def test_returns_200(self, sse_client):
        client, service = sse_client
        data = _first_sse_chunk(client, '/queue/events')
        assert data is not None  # would be None on connection failure

    def test_content_type_is_event_stream(self, sse_client):
        client, service = sse_client
        # Peek at headers without consuming the stream body
        # We check via a short read thread
        content_types = []
        done = threading.Event()

        def _check():
            resp = client.get('/queue/events')
            content_types.append(resp.content_type)
            done.set()

        threading.Thread(target=_check, daemon=True).start()
        done.wait(timeout=2.0)
        assert content_types and 'text/event-stream' in content_types[0]

    def test_initial_state_sent_on_connect(self, sse_client):
        client, service = sse_client
        data = _first_sse_chunk(client, '/queue/events')
        assert data is not None
        assert 'current' in data
        assert 'pending' in data
        assert 'pending_count' in data
        assert 'history' in data
        assert 'history_count' in data

    def test_initial_state_reflects_empty_queue(self, sse_client):
        client, service = sse_client
        data = _first_sse_chunk(client, '/queue/events')
        assert data['current'] is None
        assert data['pending_count'] == 0

    def test_initial_state_reflects_existing_queue(self, sse_client):
        client, service = sse_client
        service.add_instructions([
            {'cmd': 'forward', 'params': {}},
            {'cmd': 'stop', 'params': {}},
        ])
        data = _first_sse_chunk(client, '/queue/events')
        assert data['pending_count'] == 2

    def test_push_received_after_add(self, sse_client):
        client, service = sse_client
        events = _collect_sse_chunks(
            client, '/queue/events', count=2,
            trigger_fn=lambda: service.add_instructions([{'cmd': 'forward', 'params': {}}]),
        )
        assert len(events) >= 2
        # Second event reflects the newly added instruction
        assert events[1]['pending_count'] == 1

    def test_push_received_after_clear(self, sse_client):
        client, service = sse_client
        service.add_instructions([{'cmd': 'forward', 'params': {}}])

        events = _collect_sse_chunks(
            client, '/queue/events', count=2,
            trigger_fn=lambda: service.clear_queue(),
        )
        assert len(events) >= 2
        assert events[1]['pending_count'] == 0


# ============================================================
# 3. Stop interrupts run_python loops
# ============================================================

class TestStopInterruptsRunPython:

    def setup_method(self):
        self.driver = FakeRoverDriver()
        self.driver.stop = lambda: None

        class _TestRover:
            def forward(self, s): pass
            def stop(self): pass
            def setServo(self, p, a): pass

        self.service = RoverQueueService(
            driver=self.driver,
            rover_module=_TestRover()
        )
        self.service.start_processor()

    def teardown_method(self):
        self.service.cleanup()

    def test_clear_interrupts_sleep_loop(self):
        """clear_queue stops a long time.sleep loop well under the full duration."""
        q = self.service.subscribe()

        self.service.add_instructions([{
            'cmd': 'run_python',
            'params': {'code': 'for i in range(100):\n    time.sleep(1)\n'}
        }])

        _json(q, timeout=1.0)   # add notification
        _json(q, timeout=2.0)   # executing notification

        start = time.time()
        self.service.clear_queue()

        # clear_queue itself fires a notify (pending cleared, current still running).
        # Then the interrupted exec completes and fires a second notify with history.
        # Drain until we see history populated.
        done_data = None
        for _ in range(5):
            data = _json(q, timeout=2.0)
            if data['history_count'] > 0:
                done_data = data
                break

        elapsed = time.time() - start
        assert elapsed < 2.0, f"loop took {elapsed:.2f}s to stop — not interrupted"
        assert done_data is not None, "never received completion notification"
        assert done_data['history_count'] == 1

    def test_clear_interrupts_single_long_sleep(self):
        """clear_queue interrupts a single time.sleep(10)."""
        q = self.service.subscribe()

        self.service.add_instructions([{
            'cmd': 'run_python',
            'params': {'code': 'time.sleep(10)\n'}
        }])

        _json(q, timeout=1.0)   # add
        _json(q, timeout=2.0)   # executing

        start = time.time()
        self.service.clear_queue()
        _json(q, timeout=2.0)   # done
        elapsed = time.time() - start

        assert elapsed < 1.0, f"clear_queue took {elapsed:.2f}s — sleep was not interrupted"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
