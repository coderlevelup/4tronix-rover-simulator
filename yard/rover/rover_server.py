"""
Rover Server - Queue-based instruction processor

Runs on marspi.local:8523
Receives instructions via REST API and processes them sequentially.
"""

import json
import os
import time
import uuid
import threading
from collections import deque
from datetime import datetime
from flask import Flask, request, jsonify

from drivers import create_driver, RoverDriver

app = Flask(__name__)

# Thread-safe instruction queue
instruction_queue = deque()
queue_lock = threading.Lock()

# History of completed instructions (last 50)
instruction_history = deque(maxlen=50)

# Current instruction being executed
current_instruction = None

# Control flags
stop_requested = threading.Event()
processor_running = True

# Driver instance (injected)
driver: RoverDriver = None


def process_instruction(instruction: dict) -> None:
    """Execute a single instruction"""
    global current_instruction

    cmd = instruction.get('cmd')
    params = instruction.get('params', {})
    speed = params.get('speed', 60)
    seconds = params.get('seconds', 1.0)
    degrees = params.get('degrees', 20)

    instruction['status'] = 'executing'
    current_instruction = instruction

    try:
        if cmd == 'forward':
            driver.forward(speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'backward':
            driver.reverse(speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'spin_left':
            driver.spin_left(speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'spin_right':
            driver.spin_right(speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'steer_left':
            driver.steer_left(degrees, speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'steer_right':
            driver.steer_right(degrees, speed)
            interruptible_wait(seconds)
            driver.stop()

        elif cmd == 'stop':
            driver.stop()

        elif cmd == 'wait':
            interruptible_wait(seconds)

        else:
            print(f"Unknown command: {cmd}")

        instruction['status'] = 'completed'

    except Exception as e:
        print(f"Error executing instruction: {e}")
        instruction['status'] = 'error'
        instruction['error'] = str(e)
        driver.stop()

    # Add to history
    with queue_lock:
        instruction_history.append(instruction)

    current_instruction = None


def interruptible_wait(seconds: float) -> bool:
    """Wait for specified time, but return early if stop requested.

    Returns True if wait completed normally, False if interrupted.
    """
    interval = 0.05  # Check every 50ms
    elapsed = 0.0

    while elapsed < seconds:
        if stop_requested.is_set():
            return False
        time.sleep(interval)
        elapsed += interval

    return True


def queue_processor() -> None:
    """Background thread that processes instructions from the queue"""
    global processor_running

    print("Queue processor started")

    while processor_running:
        instruction = None

        with queue_lock:
            if instruction_queue and not stop_requested.is_set():
                instruction = instruction_queue.popleft()

        if instruction:
            process_instruction(instruction)
        else:
            # No instruction, sleep briefly
            time.sleep(0.1)

    print("Queue processor stopped")


@app.route('/queue/add', methods=['POST'])
def queue_add():
    """Add instruction(s) to the queue"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    # Accept single instruction or list
    instructions = data if isinstance(data, list) else [data]

    added = []
    with queue_lock:
        for instr in instructions:
            # Generate ID and timestamp
            instruction = {
                'id': str(uuid.uuid4()),
                'cmd': instr.get('cmd'),
                'params': instr.get('params', {}),
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'status': 'pending'
            }
            instruction_queue.append(instruction)
            added.append(instruction)

    return jsonify({
        'status': 'ok',
        'added': len(added),
        'instructions': added
    })


@app.route('/queue/clear', methods=['POST'])
def queue_clear():
    """Clear the queue and emergency stop"""
    global current_instruction

    # Signal stop to interrupt any waiting
    stop_requested.set()

    # Stop the rover immediately
    driver.stop()

    # Clear the queue
    cleared_count = 0
    with queue_lock:
        cleared_count = len(instruction_queue)
        instruction_queue.clear()

    # Reset stop flag after a brief delay
    time.sleep(0.1)
    stop_requested.clear()

    return jsonify({
        'status': 'ok',
        'cleared': cleared_count,
        'message': 'Queue cleared and rover stopped'
    })


@app.route('/queue/status', methods=['GET'])
def queue_status():
    """Get current queue status"""
    with queue_lock:
        pending = list(instruction_queue)
        history = list(instruction_history)

    return jsonify({
        'current': current_instruction,
        'pending': pending,
        'pending_count': len(pending),
        'history': history[-10:],  # Last 10 completed
        'history_count': len(history)
    })


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'driver': driver.__class__.__name__,
        'queue_size': len(instruction_queue)
    })


def main():
    global driver, processor_running

    # Create driver (auto-detects Pi vs mock)
    driver = create_driver()
    driver_name = driver.__class__.__name__

    if driver_name == 'MockRoverDriver':
        print("Using MockRoverDriver (not on Pi)")
    else:
        print("Using RealRoverDriver (Pi detected)")

    # Start queue processor thread
    processor_thread = threading.Thread(target=queue_processor, daemon=True)
    processor_thread.start()

    # Run Flask server
    try:
        print("Starting rover server on port 8523...")
        app.run(host='0.0.0.0', port=8523, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        processor_running = False
        stop_requested.set()
        driver.cleanup()


if __name__ == '__main__':
    main()
