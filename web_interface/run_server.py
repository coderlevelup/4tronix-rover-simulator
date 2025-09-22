#!/usr/bin/env python3
"""
Auto-reloading server runner for the Rover Simulator
This script will automatically restart the server when files change.
"""

import os
import sys
import time
import subprocess
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ServerRestartHandler(FileSystemEventHandler):
    def __init__(self, server_process):
        self.server_process = server_process
        self.last_restart = 0
        
    def on_modified(self, event):
        # Only restart for Python files, HTML files, or CSS files
        if event.is_directory:
            return
            
        if not (event.src_path.endswith('.py') or 
                event.src_path.endswith('.html') or 
                event.src_path.endswith('.css') or 
                event.src_path.endswith('.js')):
            return
            
        # Throttle restarts to avoid multiple rapid restarts
        current_time = time.time()
        if current_time - self.last_restart < 2:
            return
            
        self.last_restart = current_time
        print(f"\n🔄 File changed: {event.src_path}")
        print("🔄 Restarting server...")
        
        # Kill the current server process
        if self.server_process and self.server_process.poll() is None:
            self.server_process.terminate()
            self.server_process.wait()
        
        # Start a new server process
        self.start_server()
    
    def start_server(self):
        """Start the Flask server"""
        try:
            self.server_process = subprocess.Popen([
                sys.executable, 'web_interface/web_interface.py'
            ])
            print("✅ Server started successfully!")
        except Exception as e:
            print(f"❌ Error starting server: {e}")

def main():
    print("🚀 Starting Rover Simulator with auto-reload...")
    print("📁 Watching for file changes...")
    print("🛑 Press Ctrl+C to stop")
    
    # Start the initial server
    handler = ServerRestartHandler(None)
    handler.start_server()
    
    # Set up file watcher
    observer = Observer()
    observer.schedule(handler, path='.', recursive=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Stopping server...")
        observer.stop()
        if handler.server_process and handler.server_process.poll() is None:
            handler.server_process.terminate()
            handler.server_process.wait()
    
    observer.join()
    print("✅ Server stopped.")

if __name__ == '__main__':
    main()
