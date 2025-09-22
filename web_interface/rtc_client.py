"""
WebRTC client for the rover simulator
Provides a clean interface for WebRTC connections
"""

import asyncio
import json
import logging
from typing import Dict, Optional, Callable, Any
from dataclasses import dataclass
import websockets
from websockets.client import WebSocketClientProtocol


@dataclass
class RTCClientConfig:
    """Configuration for RTC client"""
    websocket_url: str = "ws://localhost:8889"
    stun_servers: list = None
    turn_servers: list = None
    reconnect_interval: float = 5.0
    max_reconnect_attempts: int = 10
    
    def __post_init__(self):
        if self.stun_servers is None:
            self.stun_servers = [{"urls": "stun:stun.l.google.com:19302"}]
        if self.turn_servers is None:
            self.turn_servers = []


class RTCClient:
    """
    WebRTC client for connecting to the rover simulator
    """
    
    def __init__(self, config: RTCClientConfig = None):
        self.config = config or RTCClientConfig()
        self.websocket_url = self.config.websocket_url
        self.websocket: Optional[WebSocketClientProtocol] = None
        self.connected = False
        self.reconnect_attempts = 0
        self.reconnect_task: Optional[asyncio.Task] = None
        
        # Event handlers
        self.on_connected: Optional[Callable] = None
        self.on_disconnected: Optional[Callable] = None
        self.on_frame_received: Optional[Callable[[bytes], None]] = None
        self.on_error: Optional[Callable[[Exception], None]] = None
        
        # Logging
        self.logger = logging.getLogger(__name__)
        
    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            self.websocket = await websockets.connect(self.websocket_url)
            self.connected = True
            self.reconnect_attempts = 0
            
            self.logger.info(f"Connected to {self.websocket_url}")
            
            if self.on_connected:
                self.on_connected()
                
            # Start listening for messages
            await self._listen_for_messages()
            
        except Exception as e:
            self.logger.error(f"Failed to connect: {e}")
            if self.on_error:
                self.on_error(e)
            await self._handle_reconnect()
            
    async def disconnect(self):
        """Disconnect from the WebSocket server"""
        self.connected = False
        
        if self.reconnect_task:
            self.reconnect_task.cancel()
            self.reconnect_task = None
            
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            
        self.logger.info("Disconnected from WebSocket server")
        
        if self.on_disconnected:
            self.on_disconnected()
            
    async def _listen_for_messages(self):
        """Listen for incoming messages"""
        try:
            async for message in self.websocket:
                await self._handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            self.logger.info("WebSocket connection closed")
            self.connected = False
            await self._handle_reconnect()
        except Exception as e:
            self.logger.error(f"Error listening for messages: {e}")
            if self.on_error:
                self.on_error(e)
                
    async def _handle_message(self, message: str):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            message_type = data.get('type')
            
            if message_type == 'frame':
                # Handle frame data
                frame_data = data.get('data')
                if frame_data and self.on_frame_received:
                    # Decode base64 frame data
                    import base64
                    frame_bytes = base64.b64decode(frame_data)
                    self.on_frame_received(frame_bytes)
                    
            elif message_type == 'offer':
                # Handle WebRTC offer
                await self._handle_offer(data)
                
            elif message_type == 'answer':
                # Handle WebRTC answer
                await self._handle_answer(data)
                
            elif message_type == 'ice_candidate':
                # Handle ICE candidate
                await self._handle_ice_candidate(data)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON received: {e}")
        except Exception as e:
            self.logger.error(f"Error handling message: {e}")
            
    async def _handle_offer(self, data: dict):
        """Handle WebRTC offer"""
        self.logger.info("Received WebRTC offer")
        # In a real implementation, this would process the offer
        
    async def _handle_answer(self, data: dict):
        """Handle WebRTC answer"""
        self.logger.info("Received WebRTC answer")
        # In a real implementation, this would process the answer
        
    async def _handle_ice_candidate(self, data: dict):
        """Handle ICE candidate"""
        self.logger.info("Received ICE candidate")
        # In a real implementation, this would process the ICE candidate
        
    async def _handle_reconnect(self):
        """Handle reconnection logic"""
        if self.reconnect_attempts >= self.config.max_reconnect_attempts:
            self.logger.error("Max reconnection attempts reached")
            return
            
        self.reconnect_attempts += 1
        self.logger.info(f"Attempting to reconnect ({self.reconnect_attempts}/{self.config.max_reconnect_attempts})")
        
        await asyncio.sleep(self.config.reconnect_interval)
        
        if not self.connected:
            self.reconnect_task = asyncio.create_task(self.connect())
            
    async def send_message(self, message: dict):
        """Send a message to the server"""
        if not self.connected or not self.websocket:
            self.logger.warning("Cannot send message: not connected")
            return
            
        try:
            await self.websocket.send(json.dumps(message))
        except Exception as e:
            self.logger.error(f"Error sending message: {e}")
            if self.on_error:
                self.on_error(e)
                
    def is_connected(self) -> bool:
        """Check if client is connected"""
        return self.connected and self.websocket is not None


class SimpleFrameReceiver:
    """
    Simple frame receiver that displays frames in a web interface
    """
    
    def __init__(self, canvas_id: str = "camera-feed"):
        self.canvas_id = canvas_id
        self.canvas = None
        self.ctx = None
        self.stream = None
        
    def setup_canvas(self, canvas_element):
        """Setup canvas element for frame display"""
        self.canvas = canvas_element
        self.ctx = canvas_element.getContext('2d')
        self.stream = canvas_element.captureStream(10)  # 10 FPS
        
    def display_frame(self, frame_bytes: bytes):
        """Display frame data on canvas"""
        if not self.canvas or not self.ctx:
            return
            
        try:
            # Create image from frame data
            img = self._create_image_from_bytes(frame_bytes)
            if img:
                # Draw image on canvas
                self.ctx.drawImage(img, 0, 0, self.canvas.width, self.canvas.height)
        except Exception as e:
            print(f"Error displaying frame: {e}")
            
    def _create_image_from_bytes(self, frame_bytes: bytes):
        """Create HTML Image element from frame bytes"""
        try:
            # Create blob from bytes
            blob = self._create_blob_from_bytes(frame_bytes)
            if blob:
                # Create object URL
                url = self._create_object_url(blob)
                if url:
                    # Create image element
                    img = self._create_image_element()
                    img.src = url
                    return img
        except Exception as e:
            print(f"Error creating image: {e}")
        return None
        
    def _create_blob_from_bytes(self, frame_bytes: bytes):
        """Create blob from frame bytes (JavaScript implementation)"""
        # This would be implemented in JavaScript
        return None
        
    def _create_object_url(self, blob):
        """Create object URL from blob (JavaScript implementation)"""
        # This would be implemented in JavaScript
        return None
        
    def _create_image_element(self):
        """Create image element (JavaScript implementation)"""
        # This would be implemented in JavaScript
        return None
