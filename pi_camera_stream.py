#!/usr/bin/env python3
"""
Pi AI Camera WebSocket Streaming Server
Streams video from Raspberry Pi AI Camera to web clients via WebSocket
"""

import asyncio
import websockets
import json
import base64
import io
import numpy as np
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Connected clients
clients = set()

# Camera and IMX500 setup
camera = None
imx500 = None
intrinsics = None

# COCO labels for object detection
COCO_LABELS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
    "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich",
    "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
    "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
    "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]


def setup_camera():
    """Initialize the Pi AI Camera with IMX500 object detection"""
    global camera, imx500, intrinsics
    logger.info("Initializing Pi AI Camera with IMX500...")

    try:
        from picamera2.devices import IMX500
        from picamera2.devices.imx500 import NetworkIntrinsics

        # IMPORTANT: Initialize IMX500 BEFORE Picamera2
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

        logger.info(f"Model task: {intrinsics.task}")
        logger.info(f"Number of labels: {len(intrinsics.labels)}")

        # Now initialize Picamera2 with IMX500's camera number
        camera = Picamera2(imx500.camera_num)
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": intrinsics.inference_rate},
            buffer_count=12
        )

        camera.configure(config)

        # Show firmware loading progress
        imx500.show_network_fw_progress_bar()

        camera.start()

        logger.info("IMX500 AI Camera initialized successfully with object detection")

    except ImportError as e:
        logger.warning(f"IMX500 not available: {e}")
        logger.info("Falling back to basic camera mode")
        camera = Picamera2()
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": 15}
        )
        camera.configure(config)
        camera.start()
    except Exception as e:
        logger.error(f"Error initializing IMX500: {e}")
        logger.info("Falling back to basic camera mode")
        camera = Picamera2()
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": 15}
        )
        camera.configure(config)
        camera.start()


def parse_detections(metadata, threshold=0.55):
    """Parse IMX500 detection results from metadata"""
    if not imx500 or not metadata:
        return []

    try:
        # Get neural network outputs
        np_outputs = imx500.get_outputs(metadata, add_batch=True)
        if np_outputs is None:
            return []

        # Get input size
        input_w, input_h = imx500.get_input_size()

        # Parse outputs (SSD MobileNetV2 format)
        # np_outputs[0] = bounding boxes (N, 4) - [y0, x0, y1, x1]
        # np_outputs[1] = scores (N,)
        # np_outputs[2] = classes (N,)
        boxes = np_outputs[0][0]
        scores = np_outputs[1][0]
        classes = np_outputs[2][0]

        detections = []
        for box, score, cls in zip(boxes, scores, classes):
            if score > threshold:
                # Convert normalized coords to pixel coords
                # box is [y0, x0, y1, x1] in normalized coordinates
                y0, x0, y1, x1 = box

                # Convert inference coords to output image coords
                pixel_box = imx500.convert_inference_coords([y0, x0, y1, x1], metadata, camera)
                x, y, w, h = pixel_box

                label = intrinsics.labels[int(cls)] if int(cls) < len(intrinsics.labels) else f"Class {int(cls)}"

                detections.append({
                    'box': (x, y, w, h),
                    'label': label,
                    'confidence': float(score)
                })

        return detections

    except Exception as e:
        logger.error(f"Error parsing detections: {e}")
        return []


async def broadcast_frame(frame_data):
    """Broadcast frame to all connected clients"""
    if not clients:
        return

    # Encode frame as base64 JPEG
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

    # Remove disconnected clients
    clients.difference_update(disconnected)


async def camera_loop():
    """Continuously capture and broadcast frames with object detection"""
    logger.info("Starting camera capture loop...")
    from PIL import Image, ImageDraw, ImageFont

    # Try to load a nice font for labels
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except:
        font = ImageFont.load_default()

    detection_count = 0

    while True:
        try:
            # Capture frame with metadata
            request = camera.capture_request()
            frame = request.make_array("main")
            metadata = request.get_metadata()

            # Parse detections from metadata
            detections = parse_detections(metadata, threshold=0.3)

            # Log detections periodically
            if detections:
                detection_count += 1
                if detection_count % 30 == 0:  # Log every 30 frames with detections
                    logger.info(f"Detected {len(detections)} objects: {[d['label'] for d in detections]}")

            request.release()

            # Convert BGR to RGB (picamera2 outputs BGR despite RGB888 config)
            frame_rgb = frame[:, :, ::-1]  # Reverse color channels

            # Convert to PIL Image
            img = Image.fromarray(frame_rgb)
            draw = ImageDraw.Draw(img)

            # Draw bounding boxes for detections
            for det in detections:
                x, y, w, h = det['box']
                confidence = det['confidence']

                # Draw bounding box
                draw.rectangle([(x, y), (x + w, y + h)], outline="lime", width=3)

                # Draw confidence percentage only
                label_text = f"{confidence:.0%}"
                text_bbox = draw.textbbox((x, y - 20), label_text, font=font)
                draw.rectangle(text_bbox, fill="lime")
                draw.text((x, y - 20), label_text, fill="black", font=font)

            # Convert to JPEG
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=70)

            # Encode to base64
            frame_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

            # Broadcast to all clients
            await broadcast_frame(frame_data)

            # Control frame rate (15 FPS = ~66ms per frame)
            await asyncio.sleep(0.066)

        except Exception as e:
            logger.error(f"Error in camera loop: {e}")
            await asyncio.sleep(0.1)


async def handle_client(websocket):
    """Handle new WebSocket client connection"""
    client_addr = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    logger.info(f"Client connected: {client_addr}")

    # Add client to set
    clients.add(websocket)

    try:
        # Keep connection alive by waiting for close
        await websocket.wait_closed()
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client disconnected: {client_addr}")
    finally:
        clients.discard(websocket)
        logger.info(f"Client removed: {client_addr}")


async def main():
    """Main entry point"""
    # Setup camera
    setup_camera()

    # Start WebSocket server
    port = 8890
    logger.info(f"Starting WebSocket server on port {port}...")
    server = await websockets.serve(handle_client, "0.0.0.0", port)
    logger.info(f"Pi AI Camera stream ready at ws://<hostname>:{port}")

    # Start camera capture loop
    camera_task = asyncio.create_task(camera_loop())

    # Keep server running
    await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        if camera:
            camera.stop()
