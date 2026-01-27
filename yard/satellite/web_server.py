"""
Satellite Web Server - Flask server for web interfaces

Runs on mro.local:5050
Serves tablet Blockly interface and TV monitor display.
Proxies API calls to rover server.
"""

import os
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Rover server URL
ROVER_URL = os.environ.get('ROVER_URL', 'http://marspi.local:8523')

# Request timeout for rover API calls
ROVER_TIMEOUT = 5.0


@app.route('/')
def index():
    """Redirect to code interface"""
    return '<a href="/code/">Go to Code Interface</a> | <a href="/monitor/">Go to Monitor</a>'


@app.route('/code/')
def code():
    """Tablet Blockly interface"""
    return render_template('code.html')


@app.route('/monitor/')
def monitor():
    """TV display interface"""
    return render_template('monitor.html')


@app.route('/api/queue/add', methods=['POST'])
def api_queue_add():
    """Proxy to rover queue/add endpoint"""
    try:
        data = request.get_json()
        resp = requests.post(
            f'{ROVER_URL}/queue/add',
            json=data,
            timeout=ROVER_TIMEOUT
        )
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Cannot connect to rover server'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Rover server timeout'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/queue/clear', methods=['POST'])
def api_queue_clear():
    """Proxy to rover queue/clear endpoint"""
    try:
        resp = requests.post(
            f'{ROVER_URL}/queue/clear',
            timeout=ROVER_TIMEOUT
        )
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Cannot connect to rover server'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Rover server timeout'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/queue/status', methods=['GET'])
def api_queue_status():
    """Proxy to rover queue/status endpoint"""
    try:
        resp = requests.get(
            f'{ROVER_URL}/queue/status',
            timeout=ROVER_TIMEOUT
        )
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Cannot connect to rover server'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Rover server timeout'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def api_health():
    """Health check - also checks rover connectivity"""
    rover_status = 'unknown'
    try:
        resp = requests.get(f'{ROVER_URL}/health', timeout=2.0)
        if resp.status_code == 200:
            rover_status = 'connected'
        else:
            rover_status = 'error'
    except requests.exceptions.ConnectionError:
        rover_status = 'disconnected'
    except requests.exceptions.Timeout:
        rover_status = 'timeout'

    return jsonify({
        'status': 'ok',
        'rover_url': ROVER_URL,
        'rover_status': rover_status
    })


if __name__ == '__main__':
    print(f"Starting satellite web server on port 5050")
    print(f"Rover URL: {ROVER_URL}")
    print("Routes:")
    print("  /code/    - Tablet Blockly interface")
    print("  /monitor/ - TV display interface")
    app.run(host='0.0.0.0', port=5050, debug=True)
