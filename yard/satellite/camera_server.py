"""
Camera Server - Pi AI Camera WebSocket Stream

Runs on mro.local:8890
Streams JPEG frames with IMX500 object detection over WebSocket.
"""

import asyncio
import base64
import io
import json
import logging
import os
import signal
import sys

import websockets

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class _ProbeNoiseFilter(logging.Filter):
    """Drop the traceback a TCP health check provokes.

    Readiness is checked by opening a socket and closing it - here, in
    web_server and in camera_control. websockets sees a connection that closed
    before sending a request line and logs a full traceback for each one, so a
    console polling every few seconds buries every real message in noise. It
    also actively hurts: camera_control scans this log to explain a failed
    start, and the explanation has to be findable.

    Narrow on purpose. Only a connection that sent nothing at all is dropped,
    which is exactly a port probe; a genuine handshake that fails still logs.
    """

    _PROBE_SIGNS = (
        'did not receive a valid HTTP request',
        'connection closed while reading HTTP request line',
    )

    def filter(self, record):
        text = record.getMessage()
        if record.exc_info and record.exc_info[1]:
            text += ' ' + str(record.exc_info[1])
        return not any(sign in text for sign in self._PROBE_SIGNS)


def _quiet_probe_logger():
    ws_logger = logging.getLogger('websockets.server')
    if not any(isinstance(f, _ProbeNoiseFilter) for f in ws_logger.filters):
        ws_logger.addFilter(_ProbeNoiseFilter())
    return ws_logger


# Global state
camera = None
imx500 = None
intrinsics = None
clients = set()
running = True

# COCO labels for object detection
COCO_LABELS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush"
]


# Which capture backend is live: 'imx500' (Pi AI camera), 'webcam' (any
# OpenCV-visible camera, including a Mac's built-in one), or None.
camera_backend = None
webcam = None


def setup_webcam(index=None):
    """Fall back to any OpenCV-visible camera.

    The point of this is development away from the yard. picamera2/IMX500 only
    exist on the Pi, so on a laptop setup_camera() fails and the monitor page
    has nothing to show - you cannot work on anything camera-shaped without
    the hardware in front of you. On macOS cv2 opens the built-in camera
    through AVFoundation, which is enough to exercise the whole stream path.

    Object detection is skipped: that runs on the IMX500's own NPU, not on the
    host. Frames come through unannotated rather than pretending to detect.
    """
    global webcam, camera_backend

    try:
        import cv2
    except ImportError:
        logger.warning("opencv-python not installed; no webcam fallback available")
        return False

    index = int(os.environ.get('CAMERA_INDEX', 0)) if index is None else index

    try:
        cap = cv2.VideoCapture(index)
        if not cap.isOpened():
            # On macOS this is almost always a permissions problem rather than
            # a missing camera: AVFoundation refuses the device until the app
            # running Python has been granted Camera access, and OpenCV reports
            # it only as "failed to properly initialize".
            if sys.platform == 'darwin':
                logger.warning(
                    f"No camera at index {index}. On macOS this is usually permission "
                    "rather than hardware: whichever app launched the satellite needs "
                    "Camera access. Set CAMERA_INDEX to try a different device."
                )
            else:
                logger.warning(f"No camera at index {index}. Set CAMERA_INDEX to try another.")
            cap.release()
            return False

        # Match the IMX500 configuration so downstream sizing is unchanged.
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        ok, _ = cap.read()
        if not ok:
            logger.warning(f"Camera at index {index} opened but returned no frame")
            cap.release()
            return False

        webcam = cap
        camera_backend = 'webcam'
        logger.info(f"Webcam fallback active on index {index} (no object detection)")
        return True

    except Exception as e:
        logger.warning(f"Webcam fallback failed: {e}")
        return False


def setup_camera():
    """Initialize the Pi AI Camera, falling back to a plain webcam."""
    global camera, imx500, intrinsics, camera_backend
    logger.info("Initializing Pi AI Camera with IMX500...")

    try:
        from picamera2 import Picamera2
        from picamera2.devices import IMX500
        from picamera2.devices.imx500 import NetworkIntrinsics

        # Initialize IMX500 BEFORE Picamera2
        model_file = "/usr/share/imx500-models/imx500_network_ssd_mobilenetv2_fpnlite_320x320_pp.rpk"
        logger.info(f"Loading IMX500 model: {model_file}")
        imx500 = IMX500(model_file)

        # Get network intrinsics
        intrinsics = imx500.network_intrinsics
        if not intrinsics:
            intrinsics = NetworkIntrinsics()
            intrinsics.task = "object detection"

        # Configure intrinsics
        intrinsics.labels = COCO_LABELS
        intrinsics.inference_rate = 15.0
        intrinsics.bbox_normalization = True
        intrinsics.bbox_order = "yx"
        intrinsics.update_with_defaults()

        # Initialize Picamera2 with IMX500's camera number
        camera = Picamera2(imx500.camera_num)
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": intrinsics.inference_rate},
            buffer_count=12
        )

        camera.configure(config)
        imx500.show_network_fw_progress_bar()
        camera.start()

        camera_backend = 'imx500'
        logger.info("IMX500 AI Camera initialized successfully with object detection")
        return True

    except ImportError as e:
        logger.warning(f"IMX500/picamera2 not available: {e}")
        logger.info("Trying a plain webcam instead (development machines)")
        return setup_webcam()

    except Exception as e:
        logger.error(f"Failed to initialize Pi camera: {e}")
        logger.info("Trying a plain webcam instead")
        return setup_webcam()


def parse_detections(metadata, threshold=0.55):
    """Parse IMX500 detection results from metadata"""
    if not imx500 or not metadata:
        return []

    try:
        # Get neural network outputs
        np_outputs = imx500.get_outputs(metadata, add_batch=True)
        if np_outputs is None:
            return []

        # Parse outputs (SSD MobileNetV2 format)
        boxes = np_outputs[0][0]    # [y0, x0, y1, x1]
        scores = np_outputs[1][0]
        classes = np_outputs[2][0]

        detections = []
        for box, score, cls in zip(boxes, scores, classes):
            if score > threshold:
                # Convert inference coords to output image coords
                y0, x0, y1, x1 = box
                pixel_box = imx500.convert_inference_coords([y0, x0, y1, x1], metadata, camera)
                x, y, w, h = pixel_box

                label = intrinsics.labels[int(cls)] if int(cls) < len(intrinsics.labels) else f"Class {int(cls)}"

                detections.append({
                    'box': (int(x), int(y), int(w), int(h)),
                    'label': label,
                    'confidence': float(score)
                })

        return detections

    except Exception as e:
        logger.error(f"Error parsing detections: {e}")
        return []


def draw_detections(frame, detections):
    """Draw bounding boxes and labels on frame"""
    import cv2
    import numpy as np

    for det in detections:
        x, y, w, h = det['box']
        label = det['label']
        conf = det['confidence']

        # Draw bounding box
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

        # Draw label background
        label_text = f"{label}: {conf:.2f}"
        (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x, y - text_h - 10), (x + text_w + 4, y), (0, 255, 0), -1)

        # Draw label text
        cv2.putText(frame, label_text, (x + 2, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    return frame


def capture_frame():
    """Capture a frame and encode as JPEG. Detections only on the IMX500."""
    import cv2
    import numpy as np

    if camera_backend == 'webcam':
        try:
            ok, frame = webcam.read()
            if not ok:
                return None
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            logger.error(f"Error capturing webcam frame: {e}")
            return None

    if not camera:
        return None

    try:
        # Capture frame with metadata
        request = camera.capture_request()
        frame = request.make_array("main")
        metadata = request.get_metadata()
        request.release()

        # Convert RGB to BGR for OpenCV
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # Get and draw detections
        detections = parse_detections(metadata)
        if detections:
            frame = draw_detections(frame, detections)

        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return base64.b64encode(buffer).decode('utf-8')

    except Exception as e:
        logger.error(f"Error capturing frame: {e}")
        return None


async def broadcast_frame(frame_data):
    """Broadcast frame to all connected clients"""
    if not clients or not frame_data:
        return

    message = json.dumps({
        'type': 'frame',
        'data': frame_data
    })

    # Send to all clients
    disconnected = set()
    for client in clients:
        try:
            await client.send(message)
        except websockets.exceptions.ConnectionClosed:
            disconnected.add(client)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            disconnected.add(client)

    # Remove disconnected clients
    clients.difference_update(disconnected)


async def frame_producer():
    """Continuously capture and broadcast frames"""
    global running

    frame_interval = 1.0 / 15.0  # 15 fps

    while running:
        if clients:
            frame_data = capture_frame()
            if frame_data:
                await broadcast_frame(frame_data)

        await asyncio.sleep(frame_interval)


async def handle_client(websocket):
    """Handle new WebSocket client connection"""
    client_addr = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    logger.info(f"Client connected: {client_addr}")

    clients.add(websocket)

    try:
        await websocket.wait_closed()
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client disconnected: {client_addr}")
    finally:
        clients.discard(websocket)
        logger.info(f"Client removed: {client_addr}")


async def main():
    global running

    # Setup camera
    if not setup_camera():
        logger.error("Failed to initialize camera, exiting (systemd restarts in 10s)")
        sys.exit(1)

    # Setup signal handlers
    def signal_handler(sig, frame):
        global running
        logger.info("Shutdown signal received")
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start frame producer task
    producer_task = asyncio.create_task(frame_producer())

    # Start WebSocket server. The port is read from the environment because
    # every client of it already is - web_server, camera_control and the
    # monitor page - so hardcoding it here would let CAMERA_PORT point all of
    # them at a port nothing is serving.
    port = int(os.environ.get('CAMERA_PORT', 8890))
    logger.info(f"Starting WebSocket server on port {port}")
    async with websockets.serve(handle_client, "0.0.0.0", port,
                                logger=_quiet_probe_logger()):
        while running:
            await asyncio.sleep(0.1)

    # Cleanup
    producer_task.cancel()
    try:
        await producer_task
    except asyncio.CancelledError:
        pass

    if camera:
        camera.stop()
        logger.info("Camera stopped")


if __name__ == '__main__':
    asyncio.run(main())
