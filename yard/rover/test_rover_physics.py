"""Unit tests for the canonical headless rover physics model.

This model is a port of rover-physics.ts (manual control) / roversimui.py
(visual sim), so the sim-video moves the same way as those. Tests lock the
behaviour that must stay consistent across all three.
"""

import math

from rover_physics import RoverPhysics, FULL_SPEED_CM_PER_SECOND


def test_forward_moves_north():
    p = RoverPhysics()
    p.set_command('forward', 80)
    p.step(1.0)
    # forward => servos straight => 80% of 10 cm/s for 1s = 8cm north (+y)
    assert abs(p.y - 8.0) < 1e-6
    assert abs(p.x) < 1e-6
    assert abs(p.heading) < 1e-6


def test_reverse_moves_south():
    p = RoverPhysics()
    p.set_command('reverse', 50)
    p.step(1.0)
    assert p.y < 0
    assert abs(p.x) < 1e-6


def test_stop_halts_motion():
    p = RoverPhysics()
    p.set_command('forward', 100)
    p.step(0.5)
    y_after_move = p.y
    p.set_command('stop')
    p.step(1.0)
    assert p.y == y_after_move  # no further movement


def test_spin_right_increases_heading():
    p = RoverPhysics()
    p.set_command('spinRight', 60)
    p.step(1.0)
    assert p.heading > 0


def test_spin_left_decreases_heading():
    p = RoverPhysics()
    p.set_command('spinLeft', 60)
    p.step(1.0)
    assert p.heading < 0


def test_apply_command_adapter_matches_set_command():
    a = RoverPhysics()
    a.set_command('forward', 70)
    a.step(1.0)

    b = RoverPhysics()
    b.apply_command({'command': 'forward', 'speed': 70})
    b.step(1.0)

    assert abs(a.x - b.x) < 1e-9
    assert abs(a.y - b.y) < 1e-9
    assert abs(a.heading - b.heading) < 1e-9


def test_matches_js_reference_vector():
    """Reference value computed from the identical rover-physics.ts algorithm.

    spinRight at speed 60 for 1.0s: heading change = (speed/100 * 10) /
    (2*pi * (8 / sin(50deg))) * 360 degrees.
    """
    p = RoverPhysics()
    p.set_command('spinRight', 60)
    p.step(1.0)

    wheel_speed_cm_s = 60 / 100.0 * FULL_SPEED_CM_PER_SECOND
    turning_radius = 8 / math.sin(math.radians(50))
    expected_heading = wheel_speed_cm_s / (2 * math.pi * turning_radius) * 360
    assert abs(p.heading - expected_heading) < 1e-6


def test_constants_match_expected():
    assert FULL_SPEED_CM_PER_SECOND == 10
