"""
Rover Queue Service - Primary Port and Application Service

This module implements the Ports & Adapters (Hexagonal) pattern:
- RoverQueuePort: Primary port interface defining application operations
- RoverQueueService: Application service implementing the core logic
"""

import time
import uuid
import threading
from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime, timezone
from typing import Optional, Callable

from drivers import RoverDriver


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
        uuid_provider: Callable[[], str] = None
    ):
        """Initialize the queue service.

        Args:
            driver: RoverDriver instance (real or mock)
            history_size: Max number of completed instructions to keep
            time_provider: Optional callable returning current datetime (for testing)
            uuid_provider: Optional callable returning UUID string (for testing)
        """
        self.driver = driver
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
        return {
            'status': 'ok',
            'driver': self.driver.__class__.__name__,
            'queue_size': len(self._queue)
        }

    def _process_queue(self) -> None:
        """Background thread that processes instructions from the queue"""
        while self._processor_running:
            instruction = None

            with self._queue_lock:
                if self._queue and not self._stop_requested.is_set():
                    instruction = self._queue.popleft()

            if instruction:
                self._execute_instruction(instruction)
            else:
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

        try:
            if cmd == 'forward':
                self.driver.forward(speed)
                self._interruptible_wait(seconds)
                self.driver.stop()

            elif cmd == 'backward':
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

            instruction['status'] = 'completed'

        except Exception as e:
            instruction['status'] = 'error'
            instruction['error'] = str(e)
            self.driver.stop()

        # Add to history
        with self._queue_lock:
            self._history.append(instruction)

        self._current = None

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
