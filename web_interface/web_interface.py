from flask import Flask, render_template, jsonify, request
import sys
import os
import time  # Import time module for sleep

# Add parent directory to path to import rover_web_driver
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rover_web_driver import RoverWebDriver

app = Flask(__name__)

# Configure rover targets
ROVER_TARGETS = {
    'simulator': 'http://127.0.0.1:8523/',
    'marspi': 'http://marspi.local:8523/'
}

# Current target (default to marspi)
current_target = 'marspi'
rover = RoverWebDriver(ROVER_TARGETS[current_target])
rover.init(40)  # Initialize with LED brightness of 40

# Define commands once at module level
commands = {
    'forward': lambda: rover.forward(speed),
    'backward': lambda: rover.reverse(speed),
    'spin_left': lambda: rover.spinLeft(speed),
    'spin_right': lambda: rover.spinRight(speed),
    'stop': lambda: rover.stop(),
    'turn_forward': lambda: rover.turnForward(speed, speed),
    'turn_reverse': lambda: rover.turnReverse(speed, speed)
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/target', methods=['GET'])
def get_target():
    """Get the current rover target"""
    return jsonify({
        'current': current_target,
        'targets': list(ROVER_TARGETS.keys())
    })

@app.route('/target/<target_name>', methods=['POST'])
def set_target(target_name):
    """Switch between simulator and real rover"""
    global current_target, rover

    if target_name not in ROVER_TARGETS:
        return jsonify({
            'status': 'error',
            'message': f'Invalid target. Valid targets: {list(ROVER_TARGETS.keys())}'
        }), 400

    # Clean up old rover connection
    rover.cleanup()

    # Create new rover connection
    current_target = target_name
    rover = RoverWebDriver(ROVER_TARGETS[current_target])
    rover.init(40)

    return jsonify({
        'status': 'success',
        'target': current_target,
        'url': ROVER_TARGETS[current_target]
    })

@app.route('/command/<cmd>', methods=['POST'])
def handle_command(cmd):
    global speed
    speed = request.json.get('speed', 100) if request.json else 100
    
    if cmd in commands:
        commands[cmd]()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid command'}), 400

@app.route('/command/turn_forward', methods=['POST'])
def handle_turn_forward():
    data = request.json or {}
    left_speed = data.get('leftSpeed', 50)
    right_speed = data.get('rightSpeed', 50)
    rover.turnForward(left_speed, right_speed)
    return jsonify({'status': 'success'})

@app.route('/command/turn_reverse', methods=['POST'])
def handle_turn_reverse():
    data = request.json or {}
    left_speed = data.get('leftSpeed', 50)
    right_speed = data.get('rightSpeed', 50)
    rover.turnReverse(left_speed, right_speed)
    return jsonify({'status': 'success'})

@app.route('/sequence', methods=['POST'])
def handle_sequence():
    global speed
    speed = 100  # Use default speed for sequences
    sequence = request.json.get('sequence', [])
    print(sequence)
    
    for instruction in sequence:
        cmd = instruction['cmd']
        print(cmd)
        time_seconds = float(instruction['time'])
        
        # Execute the command
        if cmd in commands:
            command = commands[cmd]
            print(command) 
            command()
            time.sleep(time_seconds)
            rover.stop()
            time.sleep(0.1)  # Brief pause between instructions
    
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    # Use port 80 only if on Linux and running as root
    # Default to 5001 to avoid macOS AirPlay Receiver on 5000
    port = 80 if os.name == 'posix' and os.geteuid() == 0 else 5001
    # Enable debug mode with auto-reload
    app.run(host='0.0.0.0', port=port, debug=True)

