"""
Mac Camera Server - WebSocket stream from a Mac webcam

Mirrors the wire protocol of camera_server.py (the Pi IMX500 version):
  WebSocket port 8890, JSON messages {'type':'frame','data':'<base64 JPEG>'}

Extra: a small HTTP control server on port 8891 lets the /status page
pick the camera source and switch it live.

Usage:
  python mac_camera_server.py                  # default camera (index 0)
  python mac_camera_server.py --list           # print detected cameras and exit
  python mac_camera_server.py --camera 1       # start on camera index 1
  python mac_camera_server.py --port 8890 --control-port 8891 --fps 15 --quality 80
"""

import argparse
import asyncio
import base64
import json
import logging
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import websockets

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
# Suppress noisy "opening handshake failed" logs from TCP probes hitting the
# WebSocket port without completing a handshake (e.g. Flask's _check_camera probe)
logging.getLogger('websockets.server').setLevel(logging.CRITICAL)

# ── shared state ──────────────────────────────────────────────────────────────
clients = set()          # connected WebSocket clients
running = True           # set to False by signal handler
_lock = threading.Lock()
_current_index = 0       # what's actually open in the asyncio loop
_desired_index = 0       # what the control API has requested


# ── camera enumeration ────────────────────────────────────────────────────────

def _list_cameras_avfoundation():
    """Try to enumerate cameras via pyobjc AVFoundation (gives friendly names)."""
    try:
        from AVFoundation import (
            AVMediaTypeVideo,
            AVCaptureDeviceDiscoverySession,
            AVCaptureDeviceTypeBuiltInWideAngleCamera,
            AVCaptureDeviceTypeExternalUnknown,
        )
        session = AVCaptureDeviceDiscoverySession.discoverySessionWithDeviceTypes_mediaType_position_(
            [
                AVCaptureDeviceTypeBuiltInWideAngleCamera,
                AVCaptureDeviceTypeExternalUnknown,
            ],
            AVMediaTypeVideo,
            0,  # AVCaptureDevicePositionUnspecified
        )
        devices = session.devices()
        return [d.localizedName() for d in devices]
    except Exception:
        return None


def list_cameras():
    """
    Return a list of dicts: [{index, name, active}].
    `active` is True for the camera index that is (or will soon be) open.

    Uses AVFoundation enumeration when available (works without capture permission).
    Falls back to probing cv2.VideoCapture by index if pyobjc isn't installed.
    """
    friendly_names = _list_cameras_avfoundation()

    if friendly_names is not None:
        # AVFoundation gave us an ordered device list — trust it directly.
        # Indices match OpenCV's CAP_AVFOUNDATION ordering on macOS.
        return [
            {
                'index': idx,
                'name': name,
                'active': (idx == _desired_index),
            }
            for idx, name in enumerate(friendly_names)
        ]

    # Fallback: probe by index (requires Camera permission)
    results = []
    for idx in range(8):
        cap = cv2.VideoCapture(idx, cv2.CAP_AVFOUNDATION)
        if not cap.isOpened():
            cap.release()
            continue
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        results.append({
            'index': idx,
            'name': f'Camera {idx} ({w}x{h})',
            'active': (idx == _desired_index),
        })
    return results


# ── frame capture ─────────────────────────────────────────────────────────────

def _open_capture(index, fps, quality):
    """Open a cv2.VideoCapture for the given index. Returns cap or None."""
    cap = cv2.VideoCapture(index, cv2.CAP_AVFOUNDATION)
    if not cap.isOpened():
        logger.warning(f'Could not open camera {index}')
        return None
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, fps)
    logger.info(
        f'Camera {index} opened: '
        f'{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x'
        f'{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}'
    )
    return cap


def _encode_frame(cap, quality):
    """Read one frame from cap and return base64 JPEG string, or None on failure."""
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    ok2, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok2:
        return None
    return base64.b64encode(buf).decode('utf-8')


# ── WebSocket broadcast ───────────────────────────────────────────────────────

async def broadcast_frame(frame_data):
    if not clients or not frame_data:
        return
    message = json.dumps({'type': 'frame', 'data': frame_data})
    gone = set()
    for ws in clients:
        try:
            await ws.send(message)
        except websockets.exceptions.ConnectionClosed:
            gone.add(ws)
        except Exception as e:
            logger.error(f'Send error: {e}')
            gone.add(ws)
    clients.difference_update(gone)


async def handle_client(websocket):
    addr = f'{websocket.remote_address[0]}:{websocket.remote_address[1]}'
    logger.info(f'Client connected: {addr}')
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        logger.info(f'Client disconnected: {addr}')


# ── frame producer (owns the capture object) ──────────────────────────────────

async def frame_producer(initial_index, fps, quality):
    """
    Runs in the asyncio event loop.  All cv2 calls happen here, avoiding
    cross-thread capture access.  Watches _desired_index and switches the
    device when it changes.
    """
    global _current_index, _desired_index

    _current_index = initial_index
    cap = _open_capture(initial_index, fps, quality)
    if cap is None:
        logger.warning(
            f'Camera {initial_index} unavailable at startup — '
            'check System Settings → Privacy → Camera'
        )

    frame_interval = 1.0 / fps
    empty_frames = 0

    while running:
        # Check for a requested camera switch
        with _lock:
            wanted = _desired_index
        if wanted != _current_index:
            logger.info(f'Switching camera: {_current_index} → {wanted}')
            if cap is not None:
                cap.release()
            cap = _open_capture(wanted, fps, quality)
            if cap is not None:
                _current_index = wanted
                empty_frames = 0
            else:
                logger.error(f'Camera {wanted} failed to open — keeping camera {_current_index}')
                with _lock:
                    _desired_index = _current_index  # revert the request

        # Always drain the camera buffer to keep it fresh; only broadcast when
        # clients are watching.  Idle cameras on macOS return stale/empty frames
        # if cap.read() is never called between client connections.
        if cap is not None:
            frame_data = _encode_frame(cap, quality)
            if clients:
                if frame_data:
                    empty_frames = 0
                    await broadcast_frame(frame_data)
                else:
                    empty_frames += 1
                    if empty_frames == 1:
                        logger.warning(
                            f'Camera {_current_index} returned empty frame. '
                            'If this persists, grant Camera permission to Terminal in '
                            'System Settings → Privacy & Security → Camera'
                        )

        await asyncio.sleep(frame_interval)

    if cap is not None:
        cap.release()
        logger.info('Camera released')


# ── HTTP control server ───────────────────────────────────────────────────────

class _ControlHandler(BaseHTTPRequestHandler):
    """Tiny HTTP server for the /status page picker."""

    def log_message(self, fmt, *args):
        pass  # silence the default per-request log chatter

    def _send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/devices':
            self._send_json(200, {'devices': list_cameras(), 'available': True})
        else:
            self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        global _desired_index
        if self.path == '/select':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length)) if length else {}
                idx = int(body['index'])
                with _lock:
                    _desired_index = idx
                logger.info(f'Control API: camera switch requested → {idx}')
                self._send_json(200, {'devices': list_cameras(), 'available': True})
            except (KeyError, ValueError, json.JSONDecodeError) as e:
                self._send_json(400, {'error': str(e)})
        else:
            self._send_json(404, {'error': 'not found'})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def _start_control_server(port):
    server = ThreadingHTTPServer(('0.0.0.0', port), _ControlHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    logger.info(f'Camera control API on port {port}')
    return server


# ── entry point ───────────────────────────────────────────────────────────────

def _parse_args():
    p = argparse.ArgumentParser(description='Mac camera → WebSocket stream')
    p.add_argument('--camera', type=int, default=0, help='Initial camera index (default 0)')
    p.add_argument('--list', action='store_true', help='List cameras and exit')
    p.add_argument('--port', type=int,
                   default=int(__import__('os').environ.get('CAMERA_PORT', 8890)),
                   help='WebSocket port (default 8890)')
    p.add_argument('--control-port', type=int,
                   default=int(__import__('os').environ.get('CAMERA_CONTROL_PORT', 8891)),
                   help='HTTP control port (default 8891)')
    p.add_argument('--fps', type=int, default=15, help='Target frame rate (default 15)')
    p.add_argument('--quality', type=int, default=80, help='JPEG quality 1-100 (default 80)')
    return p.parse_args()


async def _main(args):
    global running, _current_index, _desired_index

    _desired_index = args.camera

    def _stop(sig, frame):
        global running
        logger.info('Shutdown signal received')
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    _start_control_server(args.control_port)

    producer = asyncio.create_task(
        frame_producer(args.camera, args.fps, args.quality)
    )

    logger.info(f'WebSocket camera stream on ws://0.0.0.0:{args.port}')
    async with websockets.serve(handle_client, '0.0.0.0', args.port):
        while running:
            await asyncio.sleep(0.1)

    producer.cancel()
    try:
        await producer
    except asyncio.CancelledError:
        pass


def main():
    global _desired_index
    args = _parse_args()

    if args.list:
        cameras = list_cameras()
        if not cameras:
            print('No cameras detected.')
        else:
            print('Detected cameras:')
            for c in cameras:
                res = f' ({c["width"]}x{c["height"]})' if 'width' in c else ''
            print(f'  [{c["index"]}] {c["name"]}{res}')
        sys.exit(0)

    _desired_index = args.camera
    logger.info(f'Starting with camera {args.camera}')
    asyncio.run(_main(args))


if __name__ == '__main__':
    main()
