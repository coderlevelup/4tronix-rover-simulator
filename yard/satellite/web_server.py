"""
Satellite Web Server - Flask server for web interfaces

Runs on mro.local:3001 (override with the SATELLITE_PORT env var).
Serves tablet Blockly interface and TV monitor display.
Proxies API calls to rover server.
"""

import os
import json
import logging
import socket
import threading
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, session, redirect

# Load this file's own .env before anything below reads os.environ - Flask
# has no built-in equivalent of Next.js's automatic .env loading. Load by
# explicit path (not the default upward search) so this never picks up a
# different .env from a parent directory (e.g. mission-control's).
load_dotenv(Path(__file__).resolve().parent / '.env')

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


def _notify_within_app(app, mission_id, status):
    """_notify_mission_control reads current_app config, and Flask's app
    context is thread-local, so push one inside the watcher's thread."""
    from operator_console import _notify_mission_control
    with app.app_context():
        _notify_mission_control(mission_id, status)


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

# Operator console sessions. A stable secret keeps operators signed in across
# restarts; without one, sessions just reset on restart (re-login).
app.secret_key = os.environ.get('OPERATOR_SESSION_SECRET') or os.urandom(32)

# Rover server URL — a value saved from the /status page wins over the
# environment default, so field edits survive a systemd restart
ROVER_URL = _load_config().get('rover_url') or os.environ.get('ROVER_URL', 'http://marspi.local:8523')

# Operator console (/operator/) — reads the mission queue from Firestore and
# dispatches to the rover queue. The getter indirection means runtime edits to
# ROVER_URL from /status apply to the console too.
app.config['ROVER_URL_GETTER'] = lambda: ROVER_URL
import operator_console  # noqa: E402  (needs app + config above)
app.register_blueprint(operator_console.operator_bp)

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
    """Operator home: sign in first, then pick a station.

    /code/ and /monitor/ stay directly reachable without login - tablets and
    the TV are pointed at those URLs once during setup and never sign in.
    """
    operator = operator_console.current_operator()
    if not operator:
        return redirect('/operator/login')
    return render_template('home.html', operator=operator)


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
            rover['camera'] = data.get('camera')
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
@operator_console.require_operator
def api_set_rover_url():
    """Set the rover URL at runtime (from the /status page) and persist it.

    Gated because repointing the rover is a control action: anyone on the venue
    network could otherwise aim this satellite at a different machine, or at
    nothing, and the console would carry on reporting success. It costs nothing
    on event days - OPERATOR_AUTH=off makes require_operator a pass-through -
    so this only bites someone who should not be here.
    """
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
                           server_ip=_local_ip(),
                           camera_port=CAMERA_PORT)


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
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    port = int(os.environ.get('SATELLITE_PORT', 3001))
    print(f"[satellite] serving on port {port}")
    print(f"[satellite] rover url {ROVER_URL}")
    import flask.cli
    flask.cli.show_server_banner = lambda *args, **kwargs: None
    # Run the YouTube-poll loop in the background so a slow/unreachable
    # YouTube API call can't delay the tablet/monitor/rover proxy from
    # coming up - those are local and time-critical, this isn't.
    from operator_console import start_polling
    threading.Thread(target=start_polling, daemon=True).start()
    from mission_store import init_db
    from sync_worker import start_sync_worker

    init_db()

    # Recovery runs before the sync worker so an interrupted mission is flagged
    # for review before any flush can push its stale 'processing' onward.
    try:
        from recovery import recover_interrupted_missions
        from satellite_identity import satellite_id
        recover_interrupted_missions(satellite_id(), rover_url=os.environ.get('ROVER_URL'))
    except Exception as e:
        print(f'[recovery] Skipped: {e}')

    # Closes the loop the operator otherwise closes by hand: the rover already
    # records that it finished, so a mission no longer sits in 'processing'
    # (holding its lease) because someone turned to the next child.
    from mission_watcher import start_mission_watcher
    from operator_console import _notify_mission_control
    threading.Thread(
        target=start_mission_watcher,
        args=(lambda: app.config.get('ROVER_URL_GETTER', lambda: os.environ.get(
            'ROVER_URL', 'http://marspi.local:8523'))(),),
        kwargs={'notify': lambda mid, st: _notify_within_app(app, mid, st)},
        daemon=True,
    ).start()

    # Started unconditionally, with a FACTORY rather than a client. Building the
    # client here and bailing on failure would mean a satellite powered on with
    # no internet - the exact situation this whole feature exists for - never
    # starts syncing at all, so missions run offline would sit in the outbox
    # until someone restarted the process.
    #
    # Same reasoning as start_polling above: the first pull is a synchronous
    # Firestore call, so it must not block server startup.
    threading.Thread(
        target=start_sync_worker, args=(operator_console._firestore,),
        daemon=True,
    ).start()

    app.run(host='0.0.0.0', port=port, threaded=True, use_reloader=False)

