"""
Satellite Web Server - Flask server for web interfaces

Runs on mro.local:5050
Serves tablet Blockly interface and TV monitor display.
Proxies API calls to rover server.
"""

import os
import json
import socket
import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

CAMERA_PORT = int(os.environ.get('CAMERA_PORT', 8890))

# Runtime config persisted across restarts (e.g. rover URL edited on /status)
CONFIG_FILE = os.environ.get(
    'SATELLITE_CONFIG',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'satellite_config.json')
)


def _load_config():
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=2)


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

# Rover server URL — a value saved from the /status page wins over the
# environment default, so field edits survive a systemd restart
ROVER_URL = _load_config().get('rover_url') or os.environ.get('ROVER_URL', 'http://marspi.local:8523')

# Request timeout for rover API calls
ROVER_TIMEOUT = 5.0


def _check_camera():
    """Try TCP connect to localhost:CAMERA_PORT. Returns True if up."""
    try:
        s = socket.create_connection(('127.0.0.1', CAMERA_PORT), timeout=1.0)
        s.close()
        return True
    except Exception:
        return False


@app.route('/')
def index():
    """Redirect to code interface"""
    return '<a href="/code/">Go to Code Interface</a> | <a href="/monitor/">Go to Monitor</a> | <a href="/status">System Status</a>'


@app.route('/status')
def status():
    return render_template('status.html', rover_url=ROVER_URL)


@app.route('/api/status', methods=['GET'])
def api_status():
    satellite = {
        'hostname': socket.gethostname(),
        'ip': _local_ip(),
    }

    rover = {'reachable': False, 'driver': None, 'queue_size': None, 'url': ROVER_URL}
    try:
        resp = requests.get(f'{ROVER_URL}/health', timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            rover['reachable'] = True
            rover['driver'] = data.get('driver')
            rover['queue_size'] = data.get('queue_size')
            rover['status'] = data.get('status')
            rover['processor_alive'] = data.get('processor_alive')
            rover['hardware'] = data.get('hardware')
    except Exception:
        pass

    camera = {
        'reachable': _check_camera(),
        'port': CAMERA_PORT,
    }

    return jsonify({
        'satellite': satellite,
        'rover': rover,
        'camera': camera,
    })


@app.route('/api/config/rover_url', methods=['POST'])
def api_set_rover_url():
    """Set the rover URL at runtime (from the /status page) and persist it"""
    global ROVER_URL
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip().rstrip('/')
    if not url.startswith(('http://', 'https://')) or len(url.split('//', 1)[1]) == 0:
        return jsonify({'error': 'URL must start with http:// or https://'}), 400

    ROVER_URL = url
    persisted = True
    try:
        cfg = _load_config()
        cfg['rover_url'] = url
        _save_config(cfg)
    except Exception:
        persisted = False

    return jsonify({'status': 'ok', 'rover_url': url, 'persisted': persisted})


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
            # Rover heartbeats every 30s of idle, so a 45s read timeout only
            # fires when the rover died without closing the socket
            timeout=(3.05, 45)
        )
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        return Response('Rover unreachable', status=503)

    def generate():
        try:
            for chunk in rover_resp.iter_content(chunk_size=None):
                if chunk:
                    yield chunk
        except (requests.exceptions.ConnectionError,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ReadTimeout):
            # End the stream; the browser's EventSource reconnects (~3s)
            pass
        finally:
            rover_resp.close()

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


@app.route('/api/photo', methods=['GET'])
def api_photo():
    """Proxy the rover's latest photo (taken by the take-a-picture block)"""
    try:
        resp = requests.get(f'{ROVER_URL}/photo', timeout=ROVER_TIMEOUT)
        return Response(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get('Content-Type', 'image/jpeg'),
            headers={'Cache-Control': 'no-cache'}
        )
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Cannot connect to rover server'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Rover server timeout'}), 504


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
