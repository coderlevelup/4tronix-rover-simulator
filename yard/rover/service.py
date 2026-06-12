"""
Rover Queue Service - Primary Port and Application Service

This module implements the Ports & Adapters (Hexagonal) pattern:
- RoverQueuePort: Primary port interface defining application operations
- RoverQueueService: Application service implementing the core logic
"""

import sys
import time
import uuid
import logging
import threading
import queue as queue_module
from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime, timezone
from typing import Optional, Callable

from drivers import RoverDriver

logger = logging.getLogger(__name__)

# Filename given to compiled student code so the trace function can
# distinguish student frames from rover module / service internals
STUDENT_CODE_FILENAME = '<student-code>'


class StudentCodeInterrupted(Exception):
    """Raised inside student run_python code to stop it (stop button or timeout)."""


class RoverQueuePort(ABC):
    """Primary Port - defines what operations the application supports"""

    @abstractmethod
    def add_instructions(self, instructions: list) -> dict:
        """Add instruction(s) to the queue.

        Args:
            instructions: List of instruction dicts with 'cmd' and 'params'

        Returns:
            Dict with 'status', 'added' count, and 'instructions' list
        """
        pass

    @abstractmethod
    def clear_queue(self) -> dict:
        """Clear queue and emergency stop.

        Returns:
            Dict with 'status', 'cleared' count, and 'message'
        """
        pass

    @abstractmethod
    def get_status(self) -> dict:
        """Get current queue status.

        Returns:
            Dict with 'current', 'pending', 'pending_count', 'history', 'history_count'
        """
        pass

    @abstractmethod
    def get_health(self) -> dict:
        """Get service health status.

        Returns:
            Dict with 'status', 'driver', and 'queue_size'
        """
        pass


class RoverQueueService(RoverQueuePort):
    """Application Service - implements queue management and instruction execution"""

    def __init__(
        self,
        driver: RoverDriver,
        history_size: int = 50,
        time_provider: Callable[[], datetime] = None,
        uuid_provider: Callable[[], str] = None,
        rover_module=None,
        run_python_timeout: float = 120.0
    ):
        """Initialize the queue service.

        Args:
            driver: RoverDriver instance (real or fake)
            history_size: Max number of completed instructions to keep
            time_provider: Optional callable returning current datetime (for testing)
            uuid_provider: Optional callable returning UUID string (for testing)
            run_python_timeout: Wall-clock limit in seconds for run_python code
        """
        self.driver = driver
        self._run_python_timeout = run_python_timeout
        self._rover_module = rover_module
        self._time_provider = time_provider or (lambda: datetime.now(timezone.utc))
        self._uuid_provider = uuid_provider or (lambda: str(uuid.uuid4()))

        # Thread-safe instruction queue
        self._queue: deque = deque()
        self._queue_lock = threading.Lock()

        # History of completed instructions
        self._history: deque = deque(maxlen=history_size)

        # Current instruction being executed
        self._current: Optional[dict] = None

        # Control flags
        self._stop_requested = threading.Event()
        self._processor_running = False
        self._processor_thread: Optional[threading.Thread] = None

        # SSE subscribers
        self._subscribers = []
        self._subscribers_lock = threading.Lock()

    def start_processor(self) -> None:
        """Start the background queue processor thread"""
        if self._processor_running:
            return

        self._processor_running = True
        self._processor_thread = threading.Thread(target=self._process_queue, daemon=True)
        self._processor_thread.start()

    def stop_processor(self) -> None:
        """Stop the background queue processor thread"""
        self._processor_running = False
        self._stop_requested.set()
        if self._processor_thread:
            self._processor_thread.join(timeout=1.0)
            self._processor_thread = None
        self._stop_requested.clear()

    def subscribe(self):
        q = queue_module.Queue()
        with self._subscribers_lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q):
        with self._subscribers_lock:
            try:
                self._subscribers.remove(q)
            except ValueError:
                pass

    def _notify_subscribers(self):
        import json
        payload = json.dumps(self.get_status())
        with self._subscribers_lock:
            for q in self._subscribers:
                q.put_nowait(payload)

    def add_instructions(self, instructions: list) -> dict:
        """Add instruction(s) to the queue"""
        if not instructions:
            return {'status': 'error', 'error': 'No instructions provided', 'added': 0}

        # Normalize to list
        if not isinstance(instructions, list):
            instructions = [instructions]

        added = []
        with self._queue_lock:
            for instr in instructions:
                instruction = {
                    'id': self._uuid_provider(),
                    'cmd': instr.get('cmd'),
                    'params': instr.get('params', {}),
                    'timestamp': self._time_provider().isoformat() + 'Z',
                    'status': 'pending'
                }
                self._queue.append(instruction)
                added.append(instruction)

        self._notify_subscribers()
        return {
            'status': 'ok',
            'added': len(added),
            'instructions': added
        }

    def clear_queue(self) -> dict:
        """Clear queue and emergency stop"""
        # Signal stop to interrupt any waiting
        self._stop_requested.set()

        # Stop the rover immediately
        self.driver.stop()

        # Clear the queue
        with self._queue_lock:
            cleared_count = len(self._queue)
            self._queue.clear()

        # Reset stop flag after a brief delay
        time.sleep(0.1)
        self._stop_requested.clear()

        self._notify_subscribers()
        return {
            'status': 'ok',
            'cleared': cleared_count,
            'message': 'Queue cleared and rover stopped'
        }

    def get_status(self) -> dict:
        """Get current queue status"""
        with self._queue_lock:
            pending = list(self._queue)
            history = list(self._history)

        return {
            'current': self._current,
            'pending': pending,
            'pending_count': len(pending),
            'history': history[-10:],  # Last 10 completed
            'history_count': len(history)
        }

    def get_health(self) -> dict:
        """Get service health status"""
        alive = bool(self._processor_thread and self._processor_thread.is_alive())
        return {
            'status': 'ok' if alive else 'degraded',
            'processor_alive': alive,
            'driver': self.driver.__class__.__name__,
            'hardware': getattr(self.driver, 'hardware', True),
            'queue_size': len(self._queue)
        }

    def _process_queue(self) -> None:
        """Background thread that processes instructions from the queue"""
        while self._processor_running:
            try:
                instruction = None

                with self._queue_lock:
                    if self._queue and not self._stop_requested.is_set():
                        instruction = self._queue.popleft()

                if instruction:
                    self._execute_instruction(instruction)
                else:
                    time.sleep(0.1)
            except Exception:
                # An unexpected exception (e.g. a bug in subscriber fan-out)
                # must not kill the processor thread
                logger.exception('Queue processor error (continuing)')
                try:
                    self.driver.stop()
                except Exception:
                    pass
                time.sleep(0.1)

    def _execute_instruction(self, instruction: dict) -> None:
        """Execute a single instruction"""
        cmd = instruction.get('cmd')
        params = instruction.get('params', {})
        speed = params.get('speed', 60)
        seconds = params.get('seconds', 1.0)
        degrees = params.get('degrees', 20)

        instruction['status'] = 'executing'
        self._current = instruction
        self._notify_subscribers()

        try:
            if cmd == 'forward':
                self.driver.forward(speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'backward' or cmd == 'reverse':
                self.driver.reverse(speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'spin_left':
                self.driver.spin_left(speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'spin_right':
                self.driver.spin_right(speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'steer_left':
                self.driver.steer_left(degrees, speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'steer_right':
                self.driver.steer_right(degrees, speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'stop':
                self.driver.stop()

            elif cmd == 'wait':
                self._interruptible_wait(seconds)

            elif cmd == 'run_python':
                code = params.get('code', '')
                import sys
                import os
                import time as time_module
                if self._rover_module is not None:
                    rover_module = self._rover_module
                else:
                    try:
                        sys.path.insert(0, '/home/mars/marsrover')
                        import rover as rover_module
                        if not hasattr(rover_module, 'forward'):
                            raise ImportError("rover module missing hardware API")
                    except (ImportError, AttributeError):
                        # Not on Pi — use roversimulator (same API, sends to visual sim or no-ops)
                        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                        if repo_root not in sys.path:
                            sys.path.insert(0, repo_root)
                        import roversimulator as rover_module
                safe_builtins = {
                    'range': range, 'len': len, 'print': print,
                    'int': int, 'float': float, 'str': str,
                    'list': list, 'dict': dict, 'tuple': tuple,
                    'True': True, 'False': False, 'None': None,
                    'enumerate': enumerate, 'zip': zip, 'abs': abs,
                    'min': min, 'max': max, 'round': round,
                }
                service_ref = self
                class _interruptible_time:
                    sleep = staticmethod(lambda s: service_ref._interruptible_wait(s))

                # Trace each line of student code (only — other frames return
                # None) so the stop button and a wall-clock deadline can break
                # out of loops like `while True: pass`. Blocking C calls are
                # not interruptible mid-call.
                compiled = compile(code, STUDENT_CODE_FILENAME, 'exec')
                deadline = time.monotonic() + self._run_python_timeout

                def _trace(frame, event, arg):
                    if frame.f_code.co_filename != STUDENT_CODE_FILENAME:
                        return None
                    if self._stop_requested.is_set():
                        raise StudentCodeInterrupted('Stopped')
                    if time.monotonic() > deadline:
                        raise StudentCodeInterrupted(
                            f'Code ran longer than {self._run_python_timeout:.0f}s and was stopped')
                    return _trace

                sys.settrace(_trace)
                try:
                    exec(compiled, {'rover': rover_module, 'time': _interruptible_time, '__builtins__': safe_builtins})
                finally:
                    sys.settrace(None)

            instruction['status'] = 'completed'

        except Exception as e:
            instruction['status'] = 'error'
            instruction['error'] = str(e)
            self.driver.stop()

        # Add to history and clear current before notifying so subscribers
        # see consistent state (current=None, instruction already in history)
        with self._queue_lock:
            self._history.append(instruction)

        self._current = None
        self._notify_subscribers()

    def _interruptible_wait(self, seconds: float) -> bool:
        """Wait for specified time, but return early if stop requested.

        Returns True if wait completed normally, False if interrupted.
        """
        interval = 0.05  # Check every 50ms
        elapsed = 0.0

        while elapsed < seconds:
            if self._stop_requested.is_set():
                return False
            time.sleep(interval)
            elapsed += interval

        return True

    def cleanup(self) -> None:
        """Clean up resources"""
        self.stop_processor()
        self.driver.cleanup()
