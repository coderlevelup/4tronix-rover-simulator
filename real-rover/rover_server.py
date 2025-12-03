#!/usr/bin/env python3
"""
Rover Server - HTTP server to control the real 4tronix M.A.R.S. Rover

This server exposes the same HTTP API as roversimui.py, allowing the same
control programs to work with both the simulator and the real hardware.

It runs a Flask HTTP server on port 8523 and accepts JSON commands for:
- wheelMotors: Motor control
- servos: Servo positioning
- rgbLeds: RGB LED control
"""

import sys
import json
from flask import Flask, request, jsonify
import rover

# Initialize Flask app
app = Flask("RoverServer")

# Track current motor state to determine which rover function to call
current_speed_left = 0
current_speed_right = 0

def calculate_motor_command(left_fwd, left_rev, right_fwd, right_rev):
    """
    Convert wheel motor speeds to rover command.

    Returns (command_name, params) where:
    - command_name is the rover function to call
    - params are the arguments to pass
    """
    # Calculate net speeds (-100 to +100)
    if left_fwd > 0 and left_rev > 0:
        speed_left = 0
    else:
        speed_left = left_fwd - left_rev

    if right_fwd > 0 and right_rev > 0:
        speed_right = 0
    else:
        speed_right = right_fwd - right_rev

    # Determine which command to use based on motor directions
    if speed_left == 0 and speed_right == 0:
        return ('stop', [])

    elif speed_left > 0 and speed_right > 0:
        # Both forward
        if speed_left == speed_right:
            return ('forward', [speed_left])
        else:
            return ('turnForward', [speed_left, speed_right])

    elif speed_left < 0 and speed_right < 0:
        # Both reverse
        if speed_left == speed_right:
            return ('reverse', [abs(speed_left)])
        else:
            return ('turnReverse', [abs(speed_left), abs(speed_right)])

    elif speed_left < 0 and speed_right > 0:
        # Left reverse, right forward = spin left
        # Use average speed for spinning
        avg_speed = (abs(speed_left) + abs(speed_right)) / 2
        return ('spinLeft', [int(avg_speed)])

    elif speed_left > 0 and speed_right < 0:
        # Left forward, right reverse = spin right
        avg_speed = (abs(speed_left) + abs(speed_right)) / 2
        return ('spinRight', [int(avg_speed)])

    else:
        return ('stop', [])


@app.route('/', methods=['POST'])
def control_rover():
    """Handle incoming control commands"""
    try:
        data = request.json
        print(f"Received: {json.dumps(data)}")

        # Process high-level command format (new API)
        if 'command' in data:
            cmd = data['command']
            print(f"High-level command: {cmd}")

            if cmd == 'stop':
                rover.stop()
                # Set all LEDs to white when stopped
                white = rover.fromRGB(255, 255, 255)
                for i in range(4):
                    rover.setPixel(i, white)
                rover.show()
            elif cmd == 'forward':
                speed = data.get('speed', 100)
                rover.forward(speed)
                # Set front LEDs (1=left front, 3=right front) to blue
                blue = rover.fromRGB(0, 0, 255)
                white = rover.fromRGB(255, 255, 255)
                rover.setPixel(1, blue)   # Left front
                rover.setPixel(3, blue)   # Right front
                rover.setPixel(0, white)  # Left rear
                rover.setPixel(2, white)  # Right rear
                rover.show()
            elif cmd == 'reverse':
                speed = data.get('speed', 100)
                rover.reverse(speed)
                # Set rear LEDs (0=left rear, 2=right rear) to red
                red = rover.fromRGB(255, 0, 0)
                white = rover.fromRGB(255, 255, 255)
                rover.setPixel(1, white)  # Left front
                rover.setPixel(3, white)  # Right front
                rover.setPixel(0, red)    # Left rear
                rover.setPixel(2, red)    # Right rear
                rover.show()
            elif cmd == 'spinLeft':
                speed = data.get('speed', 100)
                rover.spinLeft(speed)
            elif cmd == 'spinRight':
                speed = data.get('speed', 100)
                rover.spinRight(speed)
            elif cmd == 'turnForward':
                left_speed = data.get('leftSpeed', 50)
                right_speed = data.get('rightSpeed', 50)
                rover.turnForward(left_speed, right_speed)
                # Set front LEDs to blue when turning forward
                blue = rover.fromRGB(0, 0, 255)
                white = rover.fromRGB(255, 255, 255)
                rover.setPixel(1, blue)   # Left front
                rover.setPixel(3, blue)   # Right front
                rover.setPixel(0, white)  # Left rear
                rover.setPixel(2, white)  # Right rear
                rover.show()
            elif cmd == 'turnReverse':
                left_speed = data.get('leftSpeed', 50)
                right_speed = data.get('rightSpeed', 50)
                rover.turnReverse(left_speed, right_speed)
                # Set rear LEDs to red when turning reverse
                red = rover.fromRGB(255, 0, 0)
                white = rover.fromRGB(255, 255, 255)
                rover.setPixel(1, white)  # Left front
                rover.setPixel(3, white)  # Right front
                rover.setPixel(0, red)    # Left rear
                rover.setPixel(2, red)    # Right rear
                rover.show()
            else:
                print(f"Unknown command: {cmd}")

        # Process low-level format (backward compatibility)
        else:
            # Process wheel motors
            if 'wheelMotors' in data:
                wheel_motors = data['wheelMotors']
                left_fwd, left_rev = wheel_motors.get('l', [0, 0])
                right_fwd, right_rev = wheel_motors.get('r', [0, 0])

                command, params = calculate_motor_command(left_fwd, left_rev, right_fwd, right_rev)

                # Call the appropriate rover function
                rover_func = getattr(rover, command)
                rover_func(*params)
                print(f"Motor command: {command}({params})")

            # Process servos
            if 'servos' in data:
                servos = data['servos']
                for servo_id, degrees in servos.items():
                    rover.setServo(int(servo_id), degrees)
                    print(f"Servo {servo_id}: {degrees} degrees")

            # Process RGB LEDs
            if 'rgbLeds' in data:
                rgb_leds = data['rgbLeds']
                for led_id, rgb in rgb_leds.items():
                    r, g, b = rgb
                    color = rover.fromRGB(r, g, b)
                    rover.setPixel(int(led_id), color)
                rover.show()
                print(f"Updated LEDs: {rgb_leds}")

        # Return sensor data (ultrasonic range if available)
        response = {}
        try:
            distance = rover.getDistance()
            response['ultrasonicRange'] = distance
        except:
            response['ultrasonicRange'] = 0

        return jsonify(response)

    except Exception as e:
        print(f"Error processing command: {e}")
        return jsonify({'error': str(e)}), 500


def main():
    """Initialize rover and start server"""
    print("Initializing M.A.R.S. Rover hardware...")

    # Initialize rover with default brightness
    rover.init(40)

    # Set all LEDs to white to indicate server is ready
    white = rover.fromRGB(255, 255, 255)
    for i in range(4):
        rover.setPixel(i, white)
    rover.show()
    print("LEDs set to white")

    print("Rover initialized successfully")
    print("Starting HTTP server on port 8523...")
    print("Server ready to accept commands")

    try:
        app.run(host='0.0.0.0', port=8523)
    finally:
        print("\nShutting down...")
        rover.cleanup()


if __name__ == '__main__':
    main()
