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
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Connected clients
clients = set()

# Camera setup
camera = None


def setup_camera():
    """Initialize the Pi AI Camera"""
    global camera
    logger.info("Initializing Pi AI Camera...")

    try:
        # Import IMX500 helpers
        from picamera2.devices.imx500 import IMX500, NetworkIntrinsics

        camera = Picamera2(IMX500.IMX500)
        imx500 = IMX500(camera)

        # Load default object detection model
        logger.info("Loading IMX500 object detection model...")
        model_file = "/usr/share/imx500-models/imx500_network_ssd_mobilenetv2_fpnlite_320x320_pp.rpk"
        imx500.load_network(model_file)

        # Configure camera with IMX500
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": 15},
            buffer_count=6
        )

        # Try to set up post-processing if available
        try:
            from picamera2.devices.imx500.postprocess import postprocess_nanodet_detection
            imx500.set_postprocess(postprocess_nanodet_detection)
            logger.info("Using nanodet postprocessing")
        except ImportError:
            # Postprocessing not available, but IMX500 may still provide raw results
            logger.info("Postprocessing not available, using raw IMX500 output")
            pass

        camera.configure(config)
        camera.start()

        logger.info("IMX500 object detection enabled successfully")

    except ImportError as e:
        logger.warning(f"IMX500 support not available, using basic camera mode: {e}")
        # Fall back to basic camera without AI
        camera = Picamera2()
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": 15}
        )
        camera.configure(config)
        camera.start()
    except Exception as e:
        logger.warning(f"Could not load IMX500 model, using basic camera mode: {e}")
        # Fall back to basic camera
        camera = Picamera2()
        config = camera.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            controls={"FrameRate": 15}
        )
        camera.configure(config)
        camera.start()

    logger.info("Pi AI Camera initialized successfully")


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
    """Continuously capture and broadcast frames"""
    logger.info("Starting camera capture loop...")
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np

    # Try to load a font for labels
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except:
        font = ImageFont.load_default()

    while True:
        try:
            # Capture frame with metadata
            request = camera.capture_request()
            frame = request.make_array("main")
            metadata = request.get_metadata()
            request.release()

            # Convert BGR to RGB (picamera2 outputs BGR despite RGB888 config)
            frame_rgb = frame[:, :, ::-1]  # Reverse color channels

            # Convert to PIL Image for drawing
            img = Image.fromarray(frame_rgb)
            draw = ImageDraw.Draw(img)

            # Check for AI detections in metadata
            detections = []
            if metadata:
                # Try different metadata keys that might contain detections
                if 'imx500_results' in metadata:
                    detections = metadata['imx500_results']
                elif 'IMX500Results' in metadata:
                    detections = metadata['IMX500Results']
                elif 'detections' in metadata:
                    detections = metadata['detections']

                # Log metadata keys for debugging (first frame only)
                if not hasattr(camera_loop, 'logged_metadata'):
                    logger.info(f"Available metadata keys: {list(metadata.keys())}")
                    camera_loop.logged_metadata = True

            # Parse and draw bounding boxes
            if detections and len(detections) > 0:
                logger.info(f"Found {len(detections)} detections")
                for i, detection in enumerate(detections):
                    try:
                        # Try different detection formats
                        if isinstance(detection, dict):
                            # Dictionary format: {'bbox': [...], 'category': ..., 'score': ...}
                            bbox = detection.get('bbox', detection.get('box'))
                            confidence = detection.get('score', detection.get('confidence', 1.0))
                            class_id = detection.get('category', detection.get('class_id', 0))

                            if bbox and len(bbox) >= 4:
                                x_min, y_min, x_max, y_max = bbox[:4]
                                # Scale to display resolution if needed
                                if x_max <= 1.0:  # Normalized coordinates
                                    x_min = int(x_min * 640)
                                    y_min = int(y_min * 480)
                                    x_max = int(x_max * 640)
                                    y_max = int(y_max * 480)
                        elif len(detection) >= 6:
                            # Array format: [class_id, confidence, x_min, y_min, x_max, y_max]
                            class_id = int(detection[0])
                            confidence = detection[1]
                            x_min = int(detection[2] * 640) if detection[2] <= 1.0 else int(detection[2])
                            y_min = int(detection[3] * 480) if detection[3] <= 1.0 else int(detection[3])
                            x_max = int(detection[4] * 640) if detection[4] <= 1.0 else int(detection[4])
                            y_max = int(detection[5] * 480) if detection[5] <= 1.0 else int(detection[5])
                        else:
                            continue

                        # Only show detections with confidence > 30%
                        if confidence > 0.3:
                            # Draw bounding box
                            draw.rectangle(
                                [(x_min, y_min), (x_max, y_max)],
                                outline="lime",
                                width=3
                            )

                            # Draw label with confidence
                            label = f"Object {class_id}: {confidence:.1%}"

                            # Draw background for text
                            bbox = draw.textbbox((x_min, max(y_min - 20, 0)), label, font=font)
                            draw.rectangle(bbox, fill="lime")
                            draw.text((x_min, max(y_min - 20, 0)), label, fill="black", font=font)

                    except Exception as e:
                        logger.error(f"Error drawing detection {i}: {e}")

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
