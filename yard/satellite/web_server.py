"""
Satellite Web Server - Flask server for web interfaces

Runs on mro.local:5050
Serves tablet Blockly interface and TV monitor display.
Proxies API calls to rover server.
"""

import os
import socket
import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context


def _local_ip():
    # UDP connect never sends a packet — OS just picks the right source
    # interface from the routing table. Try private ranges then fall back.
    for dest in ('10.255.255.255', '192.168.255.255', '172.16.255.255'):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect((dest, 1))
            ip = s.getsockname()[0]
            s.close()
            if not ip.startswith('127.'):
                return ip
        except Exception:
            pass
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return 'unknown'

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
    return render_template('monitor.html',
                           server_hostname=socket.gethostname(),
                           server_ip=_local_ip())


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


@app.route('/api/queue/events', methods=['GET'])
def api_queue_events():
    """SSE proxy — forwards rover event stream to browser"""
    try:
        rover_resp = requests.get(
            f'{ROVER_URL}/queue/events',
            stream=True,
            timeout=None
        )
    except requests.exceptions.ConnectionError:
        return Response('Rover unreachable', status=503)

    def generate():
        try:
            for chunk in rover_resp.iter_content(chunk_size=None):
                if chunk:
                    yield chunk
        finally:
            rover_resp.close()

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


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
    app.run(host='0.0.0.0', port=5050, threaded=True, use_reloader=False)
