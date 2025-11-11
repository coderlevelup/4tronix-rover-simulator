#!/usr/bin/env python3
"""
Raspberry Pi AI Camera Stream with Object Detection

Streams camera feed with object detection bounding boxes via WebSocket.
Runs on Raspberry Pi and streams to port 8890.
"""

import asyncio
import json
import base64
import logging
from io import BytesIO
import numpy as np
import cv2
from picamera2 import Picamera2
from picamera2.configuration import CameraConfiguration
import websockets
from threading import Thread, Event
import time

# TensorFlow Lite for object detection
try:
    from tflite_runtime.interpreter import Interpreter
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ObjectDetector:
    """Object detection using TensorFlow Lite."""

    def __init__(self, model_path='models/mobilenet_ssd_v2_coco.tflite',
                 labels_path='models/coco_labels.txt', threshold=0.5):
        """
        Initialize object detector.

        Args:
            model_path: Path to TFLite model
            labels_path: Path to labels file
            threshold: Detection confidence threshold
        """
        self.threshold = threshold

        # Load labels
        self.labels = self._load_labels(labels_path)

        # Load TFLite model
        self.interpreter = Interpreter(model_path=model_path)
        self.interpreter.allocate_tensors()

        # Get input and output details
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        self.input_height = self.input_details[0]['shape'][1]
        self.input_width = self.input_details[0]['shape'][2]

        logger.info(f"Object detector initialized: {self.input_width}x{self.input_height}")

    def _load_labels(self, path):
        """Load class labels from file."""
        try:
            with open(path, 'r') as f:
                labels = [line.strip() for line in f.readlines()]
            # Remove leading index if present (e.g., "0 background")
            labels = [label.split(' ', 1)[-1] if ' ' in label else label for label in labels]
            return labels
        except FileNotFoundError:
            logger.warning(f"Labels file not found: {path}. Using numbered labels.")
            return [f"Class {i}" for i in range(91)]  # COCO has 90 classes

    def detect(self, frame):
        """
        Detect objects in frame.

        Args:
            frame: Input image (BGR format)

        Returns:
            List of detections: [{'class': str, 'score': float, 'box': [y1, x1, y2, x2]}]
        """
        # Get original frame dimensions
        frame_height, frame_width = frame.shape[:2]

        # Resize frame for model input
        input_frame = cv2.resize(frame, (self.input_width, self.input_height))
        input_frame = np.expand_dims(input_frame, axis=0)

        # Normalize if needed (depends on model)
        if self.input_details[0]['dtype'] == np.uint8:
            input_data = input_frame.astype(np.uint8)
        else:
            input_data = (input_frame.astype(np.float32) - 127.5) / 127.5

        # Run inference
        self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
        self.interpreter.invoke()

        # Get detection results
        boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]  # Bounding boxes
        classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]  # Class indices
        scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]  # Confidence scores
        num_detections = int(self.interpreter.get_tensor(self.output_details[3]['index'])[0])

        detections = []
        for i in range(num_detections):
            if scores[i] > self.threshold:
                class_id = int(classes[i])
                class_name = self.labels[class_id] if class_id < len(self.labels) else f"Class {class_id}"

                # Convert normalized coordinates to pixel coordinates
                ymin, xmin, ymax, xmax = boxes[i]
                x1 = int(xmin * frame_width)
                y1 = int(ymin * frame_height)
                x2 = int(xmax * frame_width)
                y2 = int(ymax * frame_height)

                detections.append({
                    'class': class_name,
                    'score': float(scores[i]),
                    'box': [x1, y1, x2, y2]
                })

        return detections


class PiCameraStreamer:
    """Streams Raspberry Pi camera with object detection via WebSocket."""

    def __init__(self, port=8890, width=640, height=480, fps=10, enable_detection=True):
        """
        Initialize camera streamer.

        Args:
            port: WebSocket server port
            width: Frame width
            height: Frame height
            fps: Target frames per second
            enable_detection: Enable object detection
        """
        self.port = port
        self.width = width
        self.height = height
        self.fps = fps
        self.enable_detection = enable_detection

        self.clients = set()
        self.camera = None
        self.detector = None
        self.running = Event()
        self.frame_thread = None

        # Colors for bounding boxes (BGR)
        self.colors = [
            (0, 255, 0),    # Green
            (255, 0, 0),    # Blue
            (0, 0, 255),    # Red
            (255, 255, 0),  # Cyan
            (255, 0, 255),  # Magenta
            (0, 255, 255),  # Yellow
        ]

    def initialize_camera(self):
        """Initialize Raspberry Pi camera."""
        logger.info("Initializing Raspberry Pi camera...")
        self.camera = Picamera2()

        # Configure camera
        config = self.camera.create_preview_configuration(
            main={"size": (self.width, self.height), "format": "RGB888"}
        )
        self.camera.configure(config)
        self.camera.start()

        logger.info(f"Camera initialized: {self.width}x{self.height} @ {self.fps}fps")

    def initialize_detector(self):
        """Initialize object detector."""
        if not self.enable_detection:
            return

        try:
            logger.info("Initializing object detector...")
            self.detector = ObjectDetector()
            logger.info("Object detector ready")
        except Exception as e:
            logger.error(f"Failed to initialize detector: {e}")
            logger.warning("Running without object detection")
            self.enable_detection = False

    def draw_detections(self, frame, detections):
        """Draw bounding boxes and labels on frame."""
        for i, det in enumerate(detections):
            x1, y1, x2, y2 = det['box']
            color = self.colors[i % len(self.colors)]

            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Draw label background
            label = f"{det['class']}: {det['score']:.2f}"
            (text_width, text_height), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
            )
            cv2.rectangle(
                frame,
                (x1, y1 - text_height - baseline - 5),
                (x1 + text_width, y1),
                color,
                -1
            )

            # Draw label text
            cv2.putText(
                frame,
                label,
                (x1, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1
            )

        return frame

    def capture_and_process_frames(self):
        """Capture frames and process with object detection."""
        frame_time = 1.0 / self.fps

        while self.running.is_set():
            start_time = time.time()

            # Capture frame
            frame = self.camera.capture_array()

            # Convert RGB to BGR for OpenCV
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

            # Run object detection
            if self.enable_detection and self.detector:
                try:
                    detections = self.detector.detect(frame)
                    if detections:
                        frame = self.draw_detections(frame, detections)
                        logger.debug(f"Detected {len(detections)} objects")
                except Exception as e:
                    logger.error(f"Detection error: {e}")

            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            frame_base64 = base64.b64encode(buffer).decode('utf-8')

            # Send to all connected clients
            if self.clients:
                message = json.dumps({
                    'type': 'frame',
                    'data': frame_base64
                })
                # Send asynchronously
                asyncio.run(self.broadcast(message))

            # Maintain frame rate
            elapsed = time.time() - start_time
            sleep_time = max(0, frame_time - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    async def broadcast(self, message):
        """Broadcast message to all connected clients."""
        if self.clients:
            await asyncio.gather(
                *[client.send(message) for client in self.clients],
                return_exceptions=True
            )

    async def handle_client(self, websocket, path):
        """Handle WebSocket client connection."""
        logger.info(f"Client connected from {websocket.remote_address}")
        self.clients.add(websocket)

        try:
            async for message in websocket:
                # Handle incoming messages if needed
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.remove(websocket)
            logger.info(f"Client disconnected")

    async def start_websocket_server(self):
        """Start WebSocket server."""
        logger.info(f"Starting WebSocket server on port {self.port}...")
        async with websockets.serve(self.handle_client, "0.0.0.0", self.port):
            logger.info(f"WebSocket server running on ws://0.0.0.0:{self.port}")
            await asyncio.Future()  # Run forever

    def start(self):
        """Start camera streamer."""
        logger.info("Starting Pi Camera Streamer...")

        # Initialize camera and detector
        self.initialize_camera()
        self.initialize_detector()

        # Start frame capture thread
        self.running.set()
        self.frame_thread = Thread(target=self.capture_and_process_frames, daemon=True)
        self.frame_thread.start()

        # Start WebSocket server
        try:
            asyncio.run(self.start_websocket_server())
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            self.stop()

    def stop(self):
        """Stop camera streamer."""
        logger.info("Stopping camera streamer...")
        self.running.clear()

        if self.frame_thread:
            self.frame_thread.join(timeout=2.0)

        if self.camera:
            self.camera.stop()

        logger.info("Camera streamer stopped")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Pi AI Camera Stream with Object Detection')
    parser.add_argument('--port', type=int, default=8890, help='WebSocket server port')
    parser.add_argument('--width', type=int, default=640, help='Frame width')
    parser.add_argument('--height', type=int, default=480, help='Frame height')
    parser.add_argument('--fps', type=int, default=10, help='Target frames per second')
    parser.add_argument('--no-detection', action='store_true', help='Disable object detection')

    args = parser.parse_args()

    streamer = PiCameraStreamer(
        port=args.port,
        width=args.width,
        height=args.height,
        fps=args.fps,
        enable_detection=not args.no_detection
    )

    streamer.start()


if __name__ == '__main__':
    main()
