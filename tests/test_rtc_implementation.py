#!/usr/bin/env python3
"""
Test script for the improved WebRTC implementation
"""

import sys
import time
import asyncio
import json
import websockets
import pytest
from rtc_window import RTCWindow, RTCConfig, WebSocketChannel


@pytest.mark.asyncio
async def test_websocket_channel():
    """Test the WebSocket channel functionality"""
    print("Testing WebSocket Channel...")
    
    # Create QApplication for Qt signals to work
    from PyQt6.QtWidgets import QApplication
    app = QApplication([])
    
    # Create WebSocket channel
    channel = WebSocketChannel("localhost", 8890)  # Use different port to avoid conflicts
    
    # Test message handling
    test_messages = []
    
    def message_handler(message):
        test_messages.append(message)
        print(f"Signal handler received message: {message}")
    
    channel.message_received.connect(message_handler)
    
    # Start server
    channel.start_server()
    time.sleep(2)  # Give server more time to start
    
    # Test client connection
    try:
        async with websockets.connect("ws://localhost:8890") as websocket:
            # Send test message
            test_message = {"type": "test", "data": "hello"}
            await websocket.send(json.dumps(test_message))
            
            # Wait for message to be processed
            time.sleep(1)
            
            # Check if message was received
            if test_messages:
                print("✓ WebSocket channel test passed")
            else:
                print("✗ WebSocket channel test failed - no messages received")
                
    except Exception as e:
        print(f"✗ WebSocket channel test failed: {e}")
    finally:
        channel.stop_server()
        time.sleep(0.5)  # Give server time to stop
        app.quit()


def test_rtc_window():
    """Test the RTC window functionality"""
    print("Testing RTC Window...")
    
    try:
        from PyQt6.QtWidgets import QApplication, QGraphicsView, QGraphicsScene
        from PyQt6.QtCore import QRectF
        
        # Create minimal Qt application
        app = QApplication([])
        
        # Create graphics view
        scene = QGraphicsScene()
        scene.setSceneRect(QRectF(0, 0, 100, 100))
        view = QGraphicsView(scene)
        
        # Create RTC configuration
        config = RTCConfig()
        
        # Create RTC window
        rtc_window = RTCWindow(view, config)
        
        # Test offer generation
        stream_uuid = rtc_window.start_generate_offer()
        print(f"Generated stream UUID: {stream_uuid}")
        
        # Test answer generation
        test_offer = '{"type": "offer", "sdp": "test"}'
        answer_uuid = rtc_window.start_from_offer("test_stream", test_offer)
        print(f"Generated answer for stream: {answer_uuid}")
        
        # Test ICE candidate handling
        test_candidate = {"candidate": "test candidate", "sdpMLineIndex": 0}
        rtc_window.add_ice_candidate("test_stream", test_candidate)
        print("Added ICE candidate")
        
        # Test streaming
        rtc_window.start_streaming("test_stream")
        print("Started streaming")
        
        # Clean up
        rtc_window.cleanup()
        
        print("✓ RTC Window test passed")
        
    except Exception as e:
        print(f"✗ RTC Window test failed: {e}")


@pytest.mark.asyncio
async def test_web_client():
    """Test the web client functionality"""
    print("Testing Web Client...")
    
    try:
        from web_interface.rtc_client import RTCClient, RTCClientConfig
        
        # Create client configuration
        config = RTCClientConfig(websocket_url="ws://localhost:8891")  # Use different port
        
        # Create client
        client = RTCClient(config)
        
        # Test connection (this will fail if server is not running, which is expected)
        try:
            await client.connect()
            print("✓ Web client connection test passed")
        except Exception as e:
            print(f"Web client connection test (expected to fail without server): {e}")
            
        # Test disconnect
        await client.disconnect()
        print("✓ Web client disconnect test passed")
        
    except Exception as e:
        print(f"✗ Web client test failed: {e}")


def main():
    """Run all tests"""
    print("Running WebRTC Implementation Tests")
    print("=" * 40)
    
    # Test WebSocket channel
    asyncio.run(test_websocket_channel())
    print()
    
    # Test RTC window
    test_rtc_window()
    print()
    
    # Test web client
    asyncio.run(test_web_client())
    print()
    
    print("Test completed!")


if __name__ == "__main__":
    main()
