#!/usr/bin/env python3
"""
Run the rover simulator with WebRTC streaming enabled
"""

import subprocess
import sys
import os

def main():
    print("🚀 Starting Rover Simulator with WebRTC streaming...")
    print("📡 Simulator will stream on WebSocket port 8889")
    print("🌐 Web interface will connect to simulator automatically")
    print("🛑 Press Ctrl+C to stop")
    print("-" * 50)
    
    try:
        # Run the simulator with streaming enabled
        subprocess.run([sys.executable, "roversimui.py", "--stream"], check=True)
    except KeyboardInterrupt:
        print("\n🛑 Simulator stopped by user")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running simulator: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ roversimui.py not found. Make sure you're in the correct directory.")
        sys.exit(1)

if __name__ == "__main__":
    main()
