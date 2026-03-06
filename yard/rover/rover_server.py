"""
Rover Server - Flask HTTP Adapter

This is a thin adapter that translates HTTP requests to service calls.
All business logic is in the RoverQueueService.
"""

from flask import Flask, request, jsonify

from drivers import create_driver
from service import RoverQueueService

app = Flask(__name__)

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


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    result = service.get_health()
    return jsonify(result)


def main():
    global service

    # Create driver and service
    driver = create_driver()
    service = RoverQueueService(driver)

    driver_name = driver.__class__.__name__
    if driver_name == 'MockRoverDriver':
        print("Using MockRoverDriver (not on Pi)")
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
