"""
RTC Window implementation inspired by qtwebenginewebrtc
Provides a clean WebRTC interface for the rover simulator
"""

import sys
import json
import asyncio
import threading
import base64
from io import BytesIO
from typing import Dict, Set, Optional, Callable
from dataclasses import dataclass

from PyQt6.QtCore import QObject, pyqtSignal, QTimer, QBuffer
from PyQt6.QtWidgets import QGraphicsView
from PyQt6.QtGui import QImage, QPixmap
import cv2
import numpy as np
import websockets
from websockets.server import WebSocketServerProtocol


@dataclass
class RTCConfig:
    """Configuration for RTC connections"""
    stun_servers: list = None
    turn_servers: list = None
    ice_transport_policy: str = "all"
    bundle_policy: str = "balanced"
    rtcp_mux_policy: str = "require"
    
    def __post_init__(self):
        if self.stun_servers is None:
            self.stun_servers = [{"urls": "stun:stun.l.google.com:19302"}]
        if self.turn_servers is None:
            self.turn_servers = []


class WebSocketChannel(QObject):
    """WebSocket channel for signaling between peers"""
    
    # Signals
    message_received = pyqtSignal(dict)
    connection_state_changed = pyqtSignal(bool)
    
    def __init__(self, host: str = "localhost", port: int = 8889):
        super().__init__()
        self.host = host
        self.port = port
        self.server = None
        self.clients: Set[WebSocketServerProtocol] = set()
        self.running = False
        self.message_queue = []
        self.timer = QTimer()
        self.timer.timeout.connect(self._process_message_queue)
        # Don't start timer here - start it when server starts
        
    def start_server(self):
        """Start the WebSocket server"""
        if self.running:
            return
            
        self.running = True
        self.timer.start(10)  # Start timer when server starts
        self.server_thread = threading.Thread(target=self._run_server, daemon=True)
        self.server_thread.start()
        
    def stop_server(self):
        """Stop the WebSocket server"""
        self.running = False
        if self.server:
            self.server.close()
        self.timer.stop()
        
    def _process_message_queue(self):
        """Process queued messages from the main thread"""
        if self.message_queue:
            print(f"Processing {len(self.message_queue)} queued messages")
        while self.message_queue:
            message = self.message_queue.pop(0)
            print(f"Emitting signal for message: {message}")
            self.message_received.emit(message)
            
    def _run_server(self):
        """Run the WebSocket server in a separate thread"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop  # Store reference for broadcasting
        
        try:
            loop.run_until_complete(self._start_server())
        except Exception as e:
            print(f"WebSocket server error: {e}")
        finally:
            loop.close()
            
    async def _start_server(self):
        """Start the WebSocket server"""
        async with websockets.serve(self._handle_client, self.host, self.port):
            print(f"WebSocket server started on {self.host}:{self.port}")
            while self.running:
                await asyncio.sleep(0.1)
                
    async def _handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """Handle a new WebSocket client"""
        self.clients.add(websocket)
        self.connection_state_changed.emit(True)
        print(f"Client connected: {websocket.remote_address}")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    print(f"Received message: {data}")  # Debug print
                    # Queue message for processing in main thread
                    self.message_queue.append(data)
                except json.JSONDecodeError:
                    print(f"Invalid JSON received: {message}")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self.connection_state_changed.emit(len(self.clients) > 0)
            print(f"Client disconnected: {websocket.remote_address}")
            
    def broadcast_message(self, message: dict):
        """Broadcast a message to all connected clients"""
        if not self.clients:
            print("No clients connected to broadcast to")
            return
            
        message_str = json.dumps(message)
        print(f"Broadcasting to {len(self.clients)} clients: {message['type']}")
        disconnected = set()
        
        # Use asyncio.create_task to schedule the send operation
        async def send_to_all():
            for client in self.clients:
                try:
                    await client.send(message_str)
                except Exception as e:
                    print(f"Error sending to client: {e}")
                    disconnected.add(client)
            
            # Remove disconnected clients
            self.clients -= disconnected
        
        # Schedule the coroutine
        if hasattr(self, '_loop') and self._loop and not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(send_to_all(), self._loop)
        else:
            print("No event loop available for broadcasting")


class RTCWindow(QObject):
    """
    RTC Window for managing WebRTC connections
    Similar to the RtcWindow class in qtwebenginewebrtc
    """
    
    # Signals
    generated_offer = pyqtSignal(str, str)  # stream_uuid, offer
    generated_answer = pyqtSignal(str, str)  # stream_uuid, answer
    new_ice_candidate = pyqtSignal(str, dict)  # stream_uuid, candidate
    connection_state_changed = pyqtSignal(str, str)  # stream_uuid, state
    
    def __init__(self, graphics_view: QGraphicsView, config: RTCConfig = None):
        super().__init__()
        self.graphics_view = graphics_view
        self.config = config or RTCConfig()
        
        # WebRTC state
        self.peer_connections: Dict[str, dict] = {}
        self.stream_uuid_counter = 0
        
        # WebSocket channel for signaling
        self.websocket_channel = WebSocketChannel()
        self.websocket_channel.message_received.connect(self._handle_signaling_message)
        self.websocket_channel.start_server()
        
        # Frame capture
        self.capture_timer = QTimer()
        self.capture_timer.timeout.connect(self._capture_frame)
        self.current_frame = None
        self.frame_ready = False
        
    def start_generate_offer(self, stream_uuid: str = None) -> str:
        """Start generating an offer for a new stream"""
        if stream_uuid is None:
            stream_uuid = f"stream_{self.stream_uuid_counter}"
            self.stream_uuid_counter += 1
            
        # Initialize peer connection state
        self.peer_connections[stream_uuid] = {
            'state': 'creating_offer',
            'local_description': None,
            'remote_description': None,
            'ice_candidates': [],
            'stream': None
        }
        
        # Generate offer (simplified for this implementation)
        offer = self._create_offer(stream_uuid)
        self.peer_connections[stream_uuid]['local_description'] = offer
        
        # Emit the offer
        self.generated_offer.emit(stream_uuid, offer)
        
        return stream_uuid
        
    def start_from_offer(self, stream_uuid: str, offer: str) -> str:
        """Start from a received offer"""
        # Initialize peer connection state
        self.peer_connections[stream_uuid] = {
            'state': 'creating_answer',
            'local_description': None,
            'remote_description': offer,
            'ice_candidates': [],
            'stream': None
        }
        
        # Generate answer
        answer = self._create_answer(stream_uuid, offer)
        self.peer_connections[stream_uuid]['local_description'] = answer
        
        # Emit the answer
        self.generated_answer.emit(stream_uuid, answer)
        
        return stream_uuid
        
    def process_answer(self, stream_uuid: str, answer: str):
        """Process a received answer"""
        if stream_uuid not in self.peer_connections:
            return
            
        self.peer_connections[stream_uuid]['remote_description'] = answer
        self.peer_connections[stream_uuid]['state'] = 'connected'
        self.connection_state_changed.emit(stream_uuid, 'connected')
        
    def add_ice_candidate(self, stream_uuid: str, candidate: dict):
        """Add an ICE candidate"""
        if stream_uuid not in self.peer_connections:
            return
            
        self.peer_connections[stream_uuid]['ice_candidates'].append(candidate)
        
    def start_streaming(self, stream_uuid: str = None):
        """Start streaming frames for a specific stream"""
        # For simple frame broadcasting, we don't need peer connections
        print(f"Starting frame capture timer")
        self.capture_timer.start(100)  # 10 FPS
        print(f"Capture timer started: {self.capture_timer.isActive()}")
        
    def stop_streaming(self, stream_uuid: str = None):
        """Stop streaming for a specific stream or all streams"""
        if stream_uuid:
            if stream_uuid in self.peer_connections:
                self.peer_connections[stream_uuid]['stream'] = None
        else:
            for pc in self.peer_connections.values():
                pc['stream'] = None
                
        # Stop timer if no streams are active
        if not any(pc.get('stream') for pc in self.peer_connections.values()):
            self.capture_timer.stop()
            
    def _create_offer(self, stream_uuid: str) -> str:
        """Create a WebRTC offer (simplified)"""
        # In a real implementation, this would create a proper SDP offer
        # For now, we'll create a simple placeholder
        offer = {
            'type': 'offer',
            'sdp': f"v=0\r\no=- {stream_uuid} 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
            'stream_uuid': stream_uuid
        }
        return json.dumps(offer)
        
    def _create_answer(self, stream_uuid: str, offer: str) -> str:
        """Create a WebRTC answer (simplified)"""
        # In a real implementation, this would create a proper SDP answer
        answer = {
            'type': 'answer',
            'sdp': f"v=0\r\no=- {stream_uuid} 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
            'stream_uuid': stream_uuid
        }
        return json.dumps(answer)
        
    def _handle_signaling_message(self, message: dict):
        """Handle incoming signaling messages"""
        message_type = message.get('type')
        stream_uuid = message.get('stream_uuid')
        
        if message_type == 'offer' and stream_uuid:
            self.start_from_offer(stream_uuid, message.get('sdp', ''))
        elif message_type == 'answer' and stream_uuid:
            self.process_answer(stream_uuid, message.get('sdp', ''))
        elif message_type == 'ice_candidate' and stream_uuid:
            self.add_ice_candidate(stream_uuid, message.get('candidate', {}))
            
    def _capture_frame(self):
        """Capture frame from the graphics view"""
        try:
            if not self.graphics_view:
                return
                
            # Grab the graphics view as a pixmap
            pixmap = self.graphics_view.grab()
            if pixmap.isNull():
                return
                
            # Convert to QImage
            qimg = pixmap.toImage()
            width = qimg.width()
            height = qimg.height()
            
            if width == 0 or height == 0:
                return
                
            # Convert to numpy array
            buffer = QBuffer()
            buffer.open(QBuffer.OpenModeFlag.WriteOnly)
            success = qimg.save(buffer, "PNG")
            buffer.close()
            
            if not success:
                return
                
            # Convert buffer to numpy array
            data = buffer.data()
            nparr = np.frombuffer(data, np.uint8)
            rgb = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if rgb is None:
                return
                
            # Resize for streaming
            rgb = cv2.resize(rgb, (640, 480))
            self.current_frame = rgb
            self.frame_ready = True
            
            # Broadcast frame to all active streams
            self._broadcast_frame(rgb)
            
        except Exception as e:
            print(f"Error capturing frame: {e}")
            
    def _broadcast_frame(self, frame):
        """Broadcast frame to all active streams"""
        if not self.frame_ready or frame is None:
            return
            
        try:
            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_b64 = base64.b64encode(buffer).decode('utf-8')
            
            # Create frame message
            message = {
                'type': 'frame',
                'data': frame_b64,
                'timestamp': asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
            }
            
            # Debug: print frame info
            print(f"Broadcasting frame: {frame.shape}, data length: {len(frame_b64)}")
            
            # Broadcast to all clients
            self.websocket_channel.broadcast_message(message)
            
        except Exception as e:
            print(f"Error broadcasting frame: {e}")
            
    def cleanup(self):
        """Clean up resources"""
        self.stop_streaming()
        self.websocket_channel.stop_server()
        self.peer_connections.clear()
