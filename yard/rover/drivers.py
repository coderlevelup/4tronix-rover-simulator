"""
Rover Driver Interface and Implementations

Provides abstraction layer for rover hardware control with injectable drivers
for testability (real hardware vs mock logging).
"""

import os
import time
import threading
from abc import ABC, abstractmethod


class RoverDriver(ABC):
    """Base class for rover hardware interface"""

    @abstractmethod
    def forward(self, speed: int) -> None:
        """Move forward at given speed (0-100)"""
        pass

    @abstractmethod
    def reverse(self, speed: int) -> None:
        """Move backward at given speed (0-100)"""
        pass

    @abstractmethod
    def spin_left(self, speed: int) -> None:
        """Spin left in place at given speed"""
        pass

    @abstractmethod
    def spin_right(self, speed: int) -> None:
        """Spin right in place at given speed"""
        pass

    @abstractmethod
    def steer_left(self, degrees: float, speed: int) -> None:
        """Steer left while moving forward"""
        pass

    @abstractmethod
    def steer_right(self, degrees: float, speed: int) -> None:
        """Steer right while moving forward"""
        pass

    @abstractmethod
    def stop(self) -> None:
        """Stop all movement"""
        pass

    @abstractmethod
    def set_leds(self, pattern: str) -> None:
        """Set LED pattern: 'forward', 'reverse', 'spin_left', 'spin_right', 'stop'"""
        pass

    @abstractmethod
    def cleanup(self) -> None:
        """Clean up resources"""
        pass


class MockRoverDriver(RoverDriver):
    """Mock driver for testing - logs commands to console"""

    def __init__(self):
        self.animation_running = False
        self.animation_thread = None
        print("[MOCK] MockRoverDriver initialized")

    def forward(self, speed: int) -> None:
        print(f"[MOCK] Forward at speed {speed}")

    def reverse(self, speed: int) -> None:
        print(f"[MOCK] Reverse at speed {speed}")

    def spin_left(self, speed: int) -> None:
        print(f"[MOCK] Spin left at speed {speed}")
        self._start_animation('left')

    def spin_right(self, speed: int) -> None:
        print(f"[MOCK] Spin right at speed {speed}")
        self._start_animation('right')

    def steer_left(self, degrees: float, speed: int) -> None:
        print(f"[MOCK] Steer left {degrees}° at speed {speed}")

    def steer_right(self, degrees: float, speed: int) -> None:
        print(f"[MOCK] Steer right {degrees}° at speed {speed}")

    def stop(self) -> None:
        print("[MOCK] Stop")
        self._stop_animation()

    def set_leds(self, pattern: str) -> None:
        print(f"[MOCK] Set LEDs to pattern: {pattern}")

    def cleanup(self) -> None:
        self._stop_animation()
        print("[MOCK] Cleanup complete")

    def _start_animation(self, direction: str) -> None:
        """Start mock LED spin animation"""
        self._stop_animation()
        self.animation_running = True
        self.animation_thread = threading.Thread(
            target=self._animate_spin, args=(direction,), daemon=True
        )
        self.animation_thread.start()

    def _stop_animation(self) -> None:
        """Stop mock LED animation"""
        self.animation_running = False
        if self.animation_thread:
            self.animation_thread.join(timeout=0.5)
            self.animation_thread = None

    def _animate_spin(self, direction: str) -> None:
        """Mock spin animation - just logs periodically"""
        sequence = [1, 2, 3, 0] if direction == 'right' else [1, 0, 3, 2]
        idx = 0
        while self.animation_running:
            # Don't print every frame in mock mode to avoid spam
            time.sleep(0.15)
            idx = (idx + 1) % 4


class RealRoverDriver(RoverDriver):
    """Real hardware driver - uses rover.py module on Pi"""

    def __init__(self):
        # Import rover module (only available on Pi)
        import rover
        self.rover = rover
        self.rover.init(40)

        self.animation_running = False
        self.animation_thread = None

        # Set initial LED state
        self._set_all_leds_white()
        print("RealRoverDriver initialized")

    def forward(self, speed: int) -> None:
        self._set_leds_forward()
        self.rover.forward(speed)

    def reverse(self, speed: int) -> None:
        self._set_leds_reverse()
        self.rover.reverse(speed)

    def spin_left(self, speed: int) -> None:
        self._start_spin_animation('left')
        self.rover.spinLeft(speed)

    def spin_right(self, speed: int) -> None:
        self._start_spin_animation('right')
        self.rover.spinRight(speed)

    def steer_left(self, degrees: float, speed: int) -> None:
        self._set_leds_forward()
        # Set servo angles for left steering
        self.rover.setServo(9, degrees)    # Front left
        self.rover.setServo(15, degrees)   # Front right
        self.rover.setServo(11, -degrees)  # Rear left
        self.rover.setServo(13, -degrees)  # Rear right
        self.rover.forward(speed)

    def steer_right(self, degrees: float, speed: int) -> None:
        self._set_leds_forward()
        # Set servo angles for right steering
        self.rover.setServo(9, -degrees)   # Front left
        self.rover.setServo(15, -degrees)  # Front right
        self.rover.setServo(11, degrees)   # Rear left
        self.rover.setServo(13, degrees)   # Rear right
        self.rover.forward(speed)

    def stop(self) -> None:
        self._stop_spin_animation()
        self.rover.stop()
        # Reset servos to center
        for servo in [9, 11, 13, 15]:
            self.rover.setServo(servo, 0)
        self._set_all_leds_white()

    def set_leds(self, pattern: str) -> None:
        if pattern == 'forward':
            self._set_leds_forward()
        elif pattern == 'reverse':
            self._set_leds_reverse()
        elif pattern == 'stop':
            self._set_all_leds_white()
        # spin patterns handled by animation

    def cleanup(self) -> None:
        self._stop_spin_animation()
        self.rover.stop()
        self._set_all_leds_white()
        self.rover.cleanup()

    def _set_all_leds_white(self) -> None:
        """Set all LEDs to white"""
        white = self.rover.fromRGB(255, 255, 255)
        for i in range(4):
            self.rover.setPixel(i, white)
        self.rover.show()

    def _set_leds_forward(self) -> None:
        """Set front LEDs to blue, rear to white"""
        blue = self.rover.fromRGB(0, 0, 255)
        white = self.rover.fromRGB(255, 255, 255)
        self.rover.setPixel(1, blue)   # Front left
        self.rover.setPixel(2, blue)   # Front right
        self.rover.setPixel(0, white)  # Rear left
        self.rover.setPixel(3, white)  # Rear right
        self.rover.show()

    def _set_leds_reverse(self) -> None:
        """Set rear LEDs to red, front to white"""
        red = self.rover.fromRGB(255, 0, 0)
        white = self.rover.fromRGB(255, 255, 255)
        self.rover.setPixel(1, white)  # Front left
        self.rover.setPixel(2, white)  # Front right
        self.rover.setPixel(0, red)    # Rear left
        self.rover.setPixel(3, red)    # Rear right
        self.rover.show()

    def _start_spin_animation(self, direction: str) -> None:
        """Start LED spin animation"""
        self._stop_spin_animation()
        self.animation_running = True
        self.animation_thread = threading.Thread(
            target=self._animate_spin_leds, args=(direction,), daemon=True
        )
        self.animation_thread.start()

    def _stop_spin_animation(self) -> None:
        """Stop LED spin animation"""
        self.animation_running = False
        if self.animation_thread:
            self.animation_thread.join(timeout=0.5)
            self.animation_thread = None

    def _animate_spin_leds(self, direction: str) -> None:
        """Animate LEDs in a rotating pattern for spin commands"""
        green = self.rover.fromRGB(0, 255, 0)
        white = self.rover.fromRGB(255, 255, 255)

        # LED positions: 0 (rear left), 1 (front left), 2 (front right), 3 (rear right)
        # Clockwise (spin right): 1 -> 2 -> 3 -> 0
        # Counterclockwise (spin left): 1 -> 0 -> 3 -> 2
        if direction == 'right':
            sequence = [1, 2, 3, 0]  # Clockwise
        else:
            sequence = [1, 0, 3, 2]  # Counterclockwise

        idx = 0
        while self.animation_running:
            for i in range(4):
                if i == sequence[idx]:
                    self.rover.setPixel(i, green)
                else:
                    self.rover.setPixel(i, white)
            self.rover.show()
            idx = (idx + 1) % 4
            time.sleep(0.15)


def create_driver() -> RoverDriver:
    """Factory function to create appropriate driver based on environment"""
    # Check if running on Pi by looking for I2C device
    if os.path.exists('/dev/i2c-1'):
        try:
            return RealRoverDriver()
        except ImportError:
            print("Warning: rover module not found, falling back to MockRoverDriver")
            return MockRoverDriver()
    else:
        return MockRoverDriver()
