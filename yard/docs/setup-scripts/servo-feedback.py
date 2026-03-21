#!/usr/bin/env python3
"""
Standalone servo control for setup feedback.
Uses only smbus (pre-installed on Raspberry Pi OS).
No 4tronix libraries required.

Mast servo = channel 0
"""

import smbus
import time

# PCA9685 registers
PCA9685_ADDR = 0x40
MODE1 = 0x00
PRESCALE = 0xFE
LED0_ON_L = 0x06

# Servo pulse values (out of 4096 for 50Hz PWM)
SERVO_MIN = 150   # ~0.5ms - full left
SERVO_MID = 375   # ~1.5ms - center
SERVO_MAX = 600   # ~2.5ms - full right

bus = None


def init_pca9685():
    """Initialize PCA9685 for 50Hz servo control."""
    global bus
    bus = smbus.SMBus(1)

    # Reset
    bus.write_byte_data(PCA9685_ADDR, MODE1, 0x00)
    time.sleep(0.005)

    # Set prescale for 50Hz (servo frequency)
    # prescale = round(25MHz / (4096 * 50Hz)) - 1 = 121
    old_mode = bus.read_byte_data(PCA9685_ADDR, MODE1)
    bus.write_byte_data(PCA9685_ADDR, MODE1, (old_mode & 0x7F) | 0x10)  # Sleep
    bus.write_byte_data(PCA9685_ADDR, PRESCALE, 121)
    bus.write_byte_data(PCA9685_ADDR, MODE1, old_mode)
    time.sleep(0.005)
    bus.write_byte_data(PCA9685_ADDR, MODE1, old_mode | 0xA0)  # Auto-increment


def set_servo(channel, pulse):
    """Set servo pulse width (150-600 for typical servo)."""
    reg = LED0_ON_L + 4 * channel
    bus.write_byte_data(PCA9685_ADDR, reg, 0)      # ON_L
    bus.write_byte_data(PCA9685_ADDR, reg + 1, 0)  # ON_H
    bus.write_byte_data(PCA9685_ADDR, reg + 2, pulse & 0xFF)  # OFF_L
    bus.write_byte_data(PCA9685_ADDR, reg + 3, pulse >> 8)    # OFF_H


def set_servo_degrees(channel, degrees):
    """Set servo position in degrees (-90 to +90)."""
    # Map -90..+90 to SERVO_MIN..SERVO_MAX
    pulse = int(SERVO_MID + (degrees / 90.0) * (SERVO_MAX - SERVO_MID))
    pulse = max(SERVO_MIN, min(SERVO_MAX, pulse))
    set_servo(channel, pulse)


def stop_servo(channel):
    """Turn off servo (stop holding position)."""
    reg = LED0_ON_L + 4 * channel
    bus.write_byte_data(PCA9685_ADDR, reg + 2, 0)
    bus.write_byte_data(PCA9685_ADDR, reg + 3, 0)


# Feedback patterns
MAST = 0  # Mast servo channel


def signal_starting():
    """Mast sweeps left-right once to show setup starting."""
    init_pca9685()
    set_servo_degrees(MAST, -45)
    time.sleep(0.3)
    set_servo_degrees(MAST, 45)
    time.sleep(0.3)
    set_servo_degrees(MAST, 0)
    time.sleep(0.2)
    stop_servo(MAST)


def signal_step_complete():
    """Mast nods (looks down and up) to show step complete."""
    set_servo_degrees(MAST, -20)
    time.sleep(0.15)
    set_servo_degrees(MAST, 0)
    time.sleep(0.15)
    stop_servo(MAST)


def signal_working():
    """Mast slowly sweeps while working."""
    for _ in range(3):
        set_servo_degrees(MAST, -30)
        time.sleep(0.4)
        set_servo_degrees(MAST, 30)
        time.sleep(0.4)
    set_servo_degrees(MAST, 0)
    stop_servo(MAST)


def signal_done():
    """Mast does happy dance - multiple quick sweeps."""
    init_pca9685()
    for _ in range(3):
        set_servo_degrees(MAST, -30)
        time.sleep(0.1)
        set_servo_degrees(MAST, 30)
        time.sleep(0.1)
    set_servo_degrees(MAST, 0)
    time.sleep(0.2)
    stop_servo(MAST)


def signal_error():
    """Mast shakes rapidly side to side (error)."""
    init_pca9685()
    for _ in range(5):
        set_servo_degrees(MAST, -15)
        time.sleep(0.05)
        set_servo_degrees(MAST, 15)
        time.sleep(0.05)
    set_servo_degrees(MAST, 0)
    stop_servo(MAST)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: servo-feedback.py <signal>")
        print("Signals: starting, step, working, done, error")
        sys.exit(1)

    signal = sys.argv[1].lower()

    try:
        if signal == "starting":
            signal_starting()
        elif signal == "step":
            signal_step_complete()
        elif signal == "working":
            signal_working()
        elif signal == "done":
            signal_done()
        elif signal == "error":
            signal_error()
        else:
            print(f"Unknown signal: {signal}")
            sys.exit(1)
    except Exception as e:
        print(f"Servo error: {e}")
        sys.exit(1)
