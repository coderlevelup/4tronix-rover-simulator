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
    camera = Picamera2()

    # Configure for streaming - lower resolution for better performance
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

    while True:
        try:
            # Capture frame
            frame = camera.capture_array()

            # Convert to JPEG
            from PIL import Image
            img = Image.fromarray(frame)
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


async def handle_client(websocket, path):
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
