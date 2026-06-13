"""
Rover Server - Flask HTTP Adapter

This is a thin adapter that translates HTTP requests to service calls.
All business logic is in the RoverQueueService.
"""

import os
import re
import subprocess

from flask import Flask, request, jsonify, Response, stream_with_context, send_file
import queue as queue_module

from drivers import create_driver
from service import RoverQueueService, PHOTO_PATH

app = Flask(__name__)

# Mast-camera detection is fixed at boot (the CSI sensor is probed once), so
# we detect on first request and cache it for the process lifetime. A reboot
# restarts this process and re-probes — exactly when the answer can change.
_camera_status = None


def _probe_camera():
    """Return {'detected': bool, 'model': str|None}. Cheap I2C-level detect."""
    try:
        out = subprocess.run(
            ['rpicam-hello', '--list-cameras'],
            capture_output=True, text=True, timeout=10
        ).stdout
        m = re.search(r'imx\d+', out)
        return {'detected': bool(m), 'model': m.group(0) if m else None}
    except Exception:
        return {'detected': False, 'model': None}


def get_camera_status():
    global _camera_status
    if _camera_status is None:
        _camera_status = _probe_camera()
    return _camera_status

# Service instance - initialized in main() or create_app()
service: RoverQueueService = None


def create_app(queue_service: RoverQueueService = None) -> Flask:
    """Create Flask app with optional injected service (for testing)"""
    global service

    if queue_service:
        service = queue_service
    elif service is None:
        # Default: create service with auto-detected driver
        driver = create_driver()
        service = RoverQueueService(driver)
        service.start_processor()

    return app


@app.route('/queue/add', methods=['POST'])
def queue_add():
    """Add instruction(s) to the queue"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    result = service.add_instructions(data)

    if result.get('status') == 'error':
        return jsonify(result), 400

    return jsonify(result)


@app.route('/queue/clear', methods=['POST'])
def queue_clear():
    """Clear the queue and emergency stop"""
    result = service.clear_queue()
    return jsonify(result)


@app.route('/queue/status', methods=['GET'])
def queue_status():
    """Get current queue status"""
    result = service.get_status()
    return jsonify(result)


@app.route('/queue/events', methods=['GET'])
def queue_events():
    """SSE endpoint — streams queue state changes to subscribers"""
    def generate():
        import json
        q = service.subscribe()
        try:
            yield f"data: {json.dumps(service.get_status())}\n\n"
            while True:
                try:
                    yield f"data: {q.get(timeout=30)}\n\n"
                except queue_module.Empty:
                    yield ": heartbeat\n\n"
        finally:
            service.unsubscribe(q)

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    result = service.get_health()
    result['camera'] = get_camera_status()
    return jsonify(result)


@app.route('/photo', methods=['GET'])
def photo():
    """Serve the most recent photo taken by take_photo() in student code"""
    if not os.path.exists(PHOTO_PATH):
        return jsonify({'error': 'No photo taken yet'}), 404
    return send_file(PHOTO_PATH, mimetype='image/jpeg', max_age=0)


def main():
    global service

    # Create driver and service
    driver = create_driver()
    service = RoverQueueService(driver)

    driver_name = driver.__class__.__name__
    if driver_name == 'FakeRoverDriver':
        print("Using FakeRoverDriver (not on Pi)")
    else:
        print("Using RealRoverDriver (Pi detected)")

    # Start queue processor
    service.start_processor()
    print("Queue processor started")

    # Run Flask server
    try:
        print("Starting rover server on port 8523...")
        app.run(host='0.0.0.0', port=8523, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        service.cleanup()


if __name__ == '__main__':
    main()
