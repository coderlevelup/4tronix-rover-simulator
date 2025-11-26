# Pi AI Camera Setup

This guide explains how to set up the Pi AI Camera streaming on your Raspberry Pi 5.

## Prerequisites

- Raspberry Pi 5
- Pi AI Camera module
- Python 3.9 or later
- Network connection

## Installation

1. **Install required packages on the Pi:**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install picamera2 and dependencies
sudo apt install -y python3-picamera2 python3-websockets python3-pil

# Or use pip if needed
pip3 install picamera2 websockets pillow
```

2. **Copy the streaming script to your Pi:**

```bash
# Transfer the file to your Pi
scp pi_camera_stream.py pi@mro.local:~/
```

3. **Make the script executable:**

```bash
chmod +x ~/pi_camera_stream.py
```

## Running the Camera Stream

### Manual Start

```bash
# Start the camera stream
python3 ~/pi_camera_stream.py
```

The stream will be available at `ws://mro.local:8890` (or your Pi's IP address).

### Auto-start on Boot (Optional)

Create a systemd service to auto-start the camera stream:

```bash
# Create service file
sudo nano /etc/systemd/system/pi-camera-stream.service
```

Add the following content:

```ini
[Unit]
Description=Pi AI Camera WebSocket Stream
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/usr/bin/python3 /home/pi/pi_camera_stream.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable pi-camera-stream.service

# Start the service now
sudo systemctl start pi-camera-stream.service

# Check status
sudo systemctl status pi-camera-stream.service
```

## Connecting from the Web Interface

1. Open the web interface in your browser
2. Click on "MarsPI (Real Rover)" radio button
3. A modal will appear asking for connection details
4. Enter your Pi's hostname (default: `mro.local`) and port (default: `8890`)
5. Click "Connect"
6. The Pi AI camera stream should now be visible

## Troubleshooting

### Camera not detected
```bash
# Check if camera is detected
libcamera-hello --list-cameras
```

### Port already in use
If port 8890 is already in use, edit `pi_camera_stream.py` and change the port number on line 118.

### Connection refused
- Make sure the Pi is on the same network
- Check that the camera stream service is running: `sudo systemctl status pi-camera-stream.service`
- Verify firewall rules allow port 8890

### Check logs
```bash
# View service logs
sudo journalctl -u pi-camera-stream.service -f
```

## Performance Tips

- The default resolution is 640x480 at 15 FPS for best network performance
- For higher quality, edit `pi_camera_stream.py` and increase the resolution in the camera configuration
- For lower latency on slow networks, reduce the JPEG quality on line 88

## Configuration Options

Edit `pi_camera_stream.py` to customize:

- **Resolution**: Line 79 - Change `"size": (640, 480)`
- **Frame rate**: Line 80 - Change `"FrameRate": 15`
- **JPEG quality**: Line 88 - Change `quality=70` (1-100, higher = better quality but larger files)
- **Port**: Line 118 - Change `port = 8890`
