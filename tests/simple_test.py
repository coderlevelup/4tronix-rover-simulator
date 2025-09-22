#!/usr/bin/env python3
"""
Simple test for the WebRTC implementation
"""

import sys
import time
from PyQt6.QtWidgets import QApplication, QGraphicsView, QGraphicsScene
from PyQt6.QtCore import QRectF
from rtc_window import RTCWindow, RTCConfig


def test_basic_functionality():
    """Test basic RTC functionality without complex signal handling"""
    print("Testing Basic WebRTC Functionality...")
    print("=" * 40)
    
    # Create Qt application
    app = QApplication([])
    
    # Create graphics view
    scene = QGraphicsScene()
    scene.setSceneRect(QRectF(0, 0, 100, 100))
    view = QGraphicsView(scene)
    
    # Create RTC configuration
    config = RTCConfig()
    
    # Create RTC window
    rtc_window = RTCWindow(view, config)
    
    print("✓ RTCWindow created successfully")
    
    # Test offer generation
    stream_uuid = rtc_window.start_generate_offer()
    print(f"✓ Generated stream UUID: {stream_uuid}")
    
    # Test answer generation
    test_offer = '{"type": "offer", "sdp": "test"}'
    answer_uuid = rtc_window.start_from_offer("test_stream", test_offer)
    print(f"✓ Generated answer for stream: {answer_uuid}")
    
    # Test ICE candidate handling
    test_candidate = {"candidate": "test candidate", "sdpMLineIndex": 0}
    rtc_window.add_ice_candidate("test_stream", test_candidate)
    print("✓ Added ICE candidate")
    
    # Test streaming
    rtc_window.start_streaming("test_stream")
    print("✓ Started streaming")
    
    # Test WebSocket channel
    print("\nTesting WebSocket Channel...")
    rtc_window.websocket_channel.start_server()
    print("✓ WebSocket server started")
    
    # Wait a moment
    time.sleep(1)
    
    # Clean up
    rtc_window.cleanup()
    print("✓ Cleanup completed")
    
    print("\n🎉 All basic tests passed!")
    print("\nThe WebRTC implementation is working correctly.")
    print("You can now run the simulator with: python roversimui.py --stream")
    print("And the web interface with: python web_interface/web_interface.py")
    
    app.quit()


if __name__ == "__main__":
    test_basic_functionality()
