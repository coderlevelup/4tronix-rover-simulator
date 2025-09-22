#!/usr/bin/env python3
"""
Simple auto-reloading server runner for the Rover Simulator
Uses Flask's built-in debug mode for auto-reload.
"""

import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run the web interface
if __name__ == '__main__':
    print("🚀 Starting Rover Simulator with auto-reload...")
    print("📁 Flask will automatically reload when files change")
    print("🛑 Press Ctrl+C to stop")
    print("🌐 Server will be available at: http://localhost:5000")
    print("-" * 50)
    
    # Import and run the web interface
    from web_interface.web_interface import app
    
    # The debug=True is already set in web_interface.py
    # This will automatically reload when files change
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=True)
