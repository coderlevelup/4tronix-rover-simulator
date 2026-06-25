"""
rover_physics.py

Canonical, dependency-free rover physics for HEADLESS use (no PyQt6 / cv2).

This is a faithful port of the SAME 4-wheel steering model used by:
  - roversimui.py        (the interactive visual simulator / "real" reference)
  - rover-physics.ts     (the browser manual-control physics)

so that the headless sim-video produced by sim_recorder.py moves identically to
manual control and the visual simulator. Keep this in sync with rover-physics.ts
(mission-control/src/lib/rover-physics.ts) — the two are line-for-line
equivalent and the constants + command→servo mapping must match exactly.
"""

import math

# Physical constants — keep in sync with roversimui.py and rover-physics.ts
FULL_SPEED_CM_PER_SECOND = 10
VEHICLE_WIDTH_CM = 16
VEHICLE_HEIGHT_CM = 18
DISTANCE_BETWEEN_WHEEL_PAIRS_CM = 8

# Servo assignments (front-left, front-right, rear-left, rear-right)
SERVO_FL = 9
SERVO_FR = 15
SERVO_RL = 11
SERVO_RR = 13


class RoverPhysics:
    """Stateful 4-wheel-steering model (port of rover-physics.ts / roversimui.py).

    Pose: heading in degrees, 0 = up (north), increasing clockwise.
    """

    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.heading = 0.0
        self.speed_l = 0.0
        self.speed_r = 0.0
        self.servos = [0] * 16

    def set_command(self, command: str, speed: float = 80):
        """Map a high-level command to wheel speeds + servo angles.

        Mirrors RoverPhysics.setCommand in rover-physics.ts exactly.
        """
        if command == 'forward':
            self.servos[SERVO_FL] = 0
            self.servos[SERVO_FR] = 0
            self.servos[SERVO_RL] = 0
            self.servos[SERVO_RR] = 0
            self.speed_l = speed
            self.speed_r = speed
        elif command == 'reverse':
            self.servos[SERVO_FL] = 0
            self.servos[SERVO_FR] = 0
            self.servos[SERVO_RL] = 0
            self.servos[SERVO_RR] = 0
            self.speed_l = -speed
            self.speed_r = -speed
        elif command == 'spinLeft':
            self.servos[SERVO_FL] = 50
            self.servos[SERVO_FR] = -50
            self.servos[SERVO_RL] = -50
            self.servos[SERVO_RR] = 50
            self.speed_l = -speed
            self.speed_r = speed
        elif command == 'spinRight':
            self.servos[SERVO_FL] = 50
            self.servos[SERVO_FR] = -50
            self.servos[SERVO_RL] = -50
            self.servos[SERVO_RR] = 50
            self.speed_l = speed
            self.speed_r = -speed
        elif command == 'steerLeft':
            self.servos[SERVO_FL] = -30
            self.servos[SERVO_FR] = -30
            self.servos[SERVO_RL] = 30
            self.servos[SERVO_RR] = 30
            self.speed_l = speed
            self.speed_r = speed
        elif command == 'steerRight':
            self.servos[SERVO_FL] = 30
            self.servos[SERVO_FR] = 30
            self.servos[SERVO_RL] = -30
            self.servos[SERVO_RR] = -30
            self.speed_l = speed
            self.speed_r = speed
        elif command == 'stop':
            self.speed_l = 0
            self.speed_r = 0
            self.servos[SERVO_FL] = 0
            self.servos[SERVO_FR] = 0
            self.servos[SERVO_RL] = 0
            self.servos[SERVO_RR] = 0

    def apply_command(self, cmd: dict):
        """Adapter for the {command, speed} dict form used by sim_recorder."""
        self.set_command(cmd.get('command', ''), cmd.get('speed', 80))

    def step(self, dt: float):
        """Advance the pose by dt seconds using the 4-wheel steering model.

        Mirrors RoverPhysics.update in rover-physics.ts (including the original
        roversimui.py behaviour of using the front-left servo angle and the left
        wheel speed for all four wheels, then averaging).
        """

        def calculate_steered_position(left: bool, wheel_angle_deg: float,
                                       wheel_speed: float):
            wheel_speed_cm_s = wheel_speed / 100.0 * FULL_SPEED_CM_PER_SECOND

            if wheel_angle_deg == 0:
                heading_rad = self.heading / 180.0 * math.pi
                dist = wheel_speed_cm_s * dt
                return (
                    self.x + dist * math.sin(heading_rad),
                    self.y + dist * math.cos(heading_rad),
                    self.heading,
                )

            wheel_distance_from_centre_x = VEHICLE_WIDTH_CM / 2
            steerable_pos_x = -wheel_distance_from_centre_x if left else wheel_distance_from_centre_x
            distance_between_wheels = DISTANCE_BETWEEN_WHEEL_PAIRS_CM

            wheel_angle_rad = wheel_angle_deg / 180.0 * math.pi
            turning_radius = distance_between_wheels / math.sin(wheel_angle_rad)
            circumference = 2 * math.pi * turning_radius

            revolutions_per_second = wheel_speed_cm_s / circumference
            revolutions_turned = revolutions_per_second * dt
            heading_change_deg = revolutions_turned * 360
            heading_change_rad = revolutions_turned * 2 * math.pi

            turning_circle_centre_distance = (
                math.cos(wheel_angle_rad) * turning_radius - steerable_pos_x
            )
            vehicle_heading_rad = self.heading * math.pi / 180
            turning_circle_rel_x = turning_circle_centre_distance * math.cos(-vehicle_heading_rad)
            turning_circle_rel_y = turning_circle_centre_distance * math.sin(-vehicle_heading_rad)
            turning_circle_x = turning_circle_rel_x + self.x
            turning_circle_y = turning_circle_rel_y + self.y

            current_angle = math.atan2(self.y - turning_circle_y, self.x - turning_circle_x)
            updated_angle = current_angle - heading_change_rad
            updated_x = turning_circle_x + abs(turning_circle_centre_distance) * math.cos(updated_angle)
            updated_y = turning_circle_y + abs(turning_circle_centre_distance) * math.sin(updated_angle)

            return (updated_x, updated_y, self.heading + heading_change_deg)

        # Use the front-left servo angle and left wheel speed for all four wheels
        # (matches rover-physics.ts / roversimui.py), then average.
        angle = self.servos[SERVO_FL]
        x_fl, y_fl, h_fl = calculate_steered_position(True, angle, self.speed_l)
        x_fr, y_fr, h_fr = calculate_steered_position(False, angle, self.speed_l)
        x_bl, y_bl, h_bl = calculate_steered_position(True, angle, self.speed_l)
        x_br, y_br, h_br = calculate_steered_position(False, angle, self.speed_l)

        self.x = (x_fl + x_fr + x_bl + x_br) / 4
        self.y = (y_fl + y_fr + y_bl + y_br) / 4
        self.heading = (h_fl + h_fr + h_bl + h_br) / 4
