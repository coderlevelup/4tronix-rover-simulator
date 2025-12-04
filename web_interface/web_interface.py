from flask import Flask, render_template, jsonify, request
import sys
import os
import time  # Import time module for sleep

# Add parent directory to path to import rover_web_driver
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rover_web_driver import RoverWebDriver

app = Flask(__name__)

# Create two separate rover instances
real_rover = RoverWebDriver('http://marspi.local:8523/')
real_rover.init(40)

sim_rover = RoverWebDriver('http://127.0.0.1:8523/')
sim_rover.init(40)

# Real rover routes
@app.route('/')
def index():
    """Real rover page"""
    return render_template('real.html')

@app.route('/command/<cmd>', methods=['POST'])
def handle_real_command(cmd):
    """Handle commands for real rover"""
    global speed
    speed = request.json.get('speed', 100) if request.json else 100

    commands = {
        'forward': lambda: real_rover.forward(speed),
        'backward': lambda: real_rover.reverse(speed),
        'spin_left': lambda: real_rover.spinLeft(speed),
        'spin_right': lambda: real_rover.spinRight(speed),
        'stop': lambda: real_rover.stop(),
        'steer_left': lambda: real_rover.steerLeft(20, 0),  # Continuous steering
        'steer_right': lambda: real_rover.steerRight(20, 0)  # Continuous steering
    }

    if cmd in commands:
        commands[cmd]()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid command'}), 400

@app.route('/sequence', methods=['POST'])
def handle_real_sequence():
    """Handle sequence execution for real rover"""
    sequence = request.json.get('sequence', [])

    for instruction in sequence:
        cmd = instruction['cmd']
        time_seconds = float(instruction.get('time', 1))

        # Execute the command
        if cmd == 'forward':
            real_rover.forward(100)
        elif cmd == 'backward':
            real_rover.reverse(100)
        elif cmd == 'spin_left':
            real_rover.spinLeft(100)
        elif cmd == 'spin_right':
            real_rover.spinRight(100)
        elif cmd == 'stop':
            real_rover.stop()
        elif cmd == 'steer_left':
            degrees = instruction.get('degrees', 20)
            seconds = instruction.get('seconds', 1)
            real_rover.steerLeft(degrees, seconds)
        elif cmd == 'steer_right':
            degrees = instruction.get('degrees', 20)
            seconds = instruction.get('seconds', 1)
            real_rover.steerRight(degrees, seconds)

        time.sleep(time_seconds)
        real_rover.stop()
        time.sleep(0.1)  # Brief pause between instructions

    return jsonify({'status': 'success'})

# Simulator routes
@app.route('/sim')
def sim_index():
    """Simulator page"""
    return render_template('sim.html')

@app.route('/sim/command/<cmd>', methods=['POST'])
def handle_sim_command(cmd):
    """Handle commands for simulator"""
    global speed
    speed = request.json.get('speed', 100) if request.json else 100

    commands = {
        'forward': lambda: sim_rover.forward(speed),
        'backward': lambda: sim_rover.reverse(speed),
        'spin_left': lambda: sim_rover.spinLeft(speed),
        'spin_right': lambda: sim_rover.spinRight(speed),
        'stop': lambda: sim_rover.stop(),
        'steer_left': lambda: sim_rover.steerLeft(20, 0),  # Continuous steering
        'steer_right': lambda: sim_rover.steerRight(20, 0)  # Continuous steering
    }

    if cmd in commands:
        commands[cmd]()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid command'}), 400

@app.route('/sim/sequence', methods=['POST'])
def handle_sim_sequence():
    """Handle sequence execution for simulator"""
    sequence = request.json.get('sequence', [])

    for instruction in sequence:
        cmd = instruction['cmd']
        time_seconds = float(instruction.get('time', 1))

        # Execute the command
        if cmd == 'forward':
            sim_rover.forward(100)
        elif cmd == 'backward':
            sim_rover.reverse(100)
        elif cmd == 'spin_left':
            sim_rover.spinLeft(100)
        elif cmd == 'spin_right':
            sim_rover.spinRight(100)
        elif cmd == 'stop':
            sim_rover.stop()
        elif cmd == 'steer_left':
            degrees = instruction.get('degrees', 20)
            seconds = instruction.get('seconds', 1)
            sim_rover.steerLeft(degrees, seconds)
        elif cmd == 'steer_right':
            degrees = instruction.get('degrees', 20)
            seconds = instruction.get('seconds', 1)
            sim_rover.steerRight(degrees, seconds)

        time.sleep(time_seconds)
        sim_rover.stop()
        time.sleep(0.1)  # Brief pause between instructions

    return jsonify({'status': 'success'})

if __name__ == '__main__':
    # Use port 80 only if on Linux and running as root
    # Default to 5001 to avoid macOS AirPlay Receiver on 5000
    port = 80 if os.name == 'posix' and os.geteuid() == 0 else 5050
    # Enable debug mode with auto-reload
    app.run(host='0.0.0.0', port=port, debug=True)

