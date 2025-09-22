@echo off
echo 🚀 Starting Rover Simulator with WebRTC streaming...
echo 📡 Simulator will stream on WebSocket port 8889
echo 🌐 Web interface will connect to simulator automatically
echo 🛑 Press Ctrl+C to stop
echo --------------------------------------------------

python roversimui.py --stream

pause
