# Pi AI Camera Stream Setup

This guide provides complete setup instructions for the Pi AI Camera streaming with object detection on Raspberry Pi 5.

## Hardware Requirements

- Raspberry Pi 5
- Pi AI Camera (IMX500 module)
- Network connection (WiFi or Ethernet)
- Power supply for Pi 5

## Software Installation

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Required Packages

Install all dependencies in one command:

```bash
sudo apt install -y python3-picamera2 python3-websockets python3-pil python3-opencv python3-numpy
```

Or install individually:

```bash
# Picamera2 library (for camera control)
sudo apt install -y python3-picamera2

# WebSocket library (for streaming)
sudo apt install -y python3-websockets

# PIL/Pillow (for image processing and bounding boxes)
sudo apt install -y python3-pil

# OpenCV (required for IMX500 AI processing)
sudo apt install -y python3-opencv

# NumPy (image array handling)
sudo apt install -y python3-numpy
```

### 3. Install IMX500 Models and Tools

The IMX500 neural network models should be included with recent Raspberry Pi OS images. Verify installation:

```bash
# Check for IMX500 models directory
ls /usr/share/imx500-models/

# If missing, install the IMX500 tools package
sudo apt install -y imx500-all
```

### 4. Enable Camera Interface

```bash
# Check if camera is detected
libcamera-hello --list-cameras

# If camera not detected, enable via raspi-config
sudo raspi-config
# Navigate to: Interface Options > Camera > Enable
```

## Deploy Camera Stream Script

### 1. Clone or Update Repository on Pi 5

```bash
# On the Pi 5 (first time, as user mars)
git clone https://github.com/coderlevelup/4tronix-rover-simulator.git
cd 4tronix-rover-simulator

# Or update existing repository
cd ~/4tronix-rover-simulator
git pull
```

### 2. Test Manually

```bash
# Run the stream
cd ~/4tronix-rover-simulator
python3 pi_camera_stream.py
```

You should see output like:
```
INFO:__main__:Initializing Pi AI Camera...
INFO:__main__:Loading IMX500 object detection model...
INFO:__main__:IMX500 object detection enabled successfully
INFO:__main__:Pi AI Camera initialized successfully
INFO:__main__:Starting WebSocket server on port 8890...
INFO:__main__:Pi AI Camera stream ready at ws://<hostname>:8890
INFO:__main__:Starting camera capture loop...
```

## Auto-Start on Boot (Optional)

### 1. Create Systemd Service

```bash
sudo nano /etc/systemd/system/pi-camera-stream.service
```

Add this content:

```ini
[Unit]
Description=Pi AI Camera WebSocket Stream with Object Detection
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

### 2. Enable and Start Service

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

### 3. Manage Service

```bash
# Stop service
sudo systemctl stop pi-camera-stream.service

# Restart service
sudo systemctl restart pi-camera-stream.service

# View logs
sudo journalctl -u pi-camera-stream.service -f
```

## Connecting from Web Interface

1. Open the web interface in your browser
2. Select "MarsPI (Real Rover)" radio button
3. Enter Pi hostname (default: `mro.local`) and port (default: `8890`)
4. Click "Connect"
5. Video stream with object detection bounding boxes should appear

## Troubleshooting

### Camera Not Detected

```bash
# List available cameras
libcamera-hello --list-cameras

# Test camera capture
libcamera-still -o test.jpg

# Check camera cable connection and ensure it's firmly seated
```

### IMX500 Not Loading

If you see: `WARNING:__main__:IMX500 support not available, using basic camera mode`

Check dependencies:

```bash
# Verify OpenCV installation
python3 -c "import cv2; print(cv2.__version__)"

# Verify IMX500 module
python3 -c "from picamera2.devices.imx500 import IMX500; print('IMX500 available')"

# Check for model files
ls -la /usr/share/imx500-models/
```

### Postprocessing Not Available

If you see: `INFO:__main__:Postprocessing not available, using raw IMX500 output`

This is normal and the script will still attempt to extract detection results from the IMX500. However, if detections aren't working, try updating picamera2:

```bash
# Update picamera2 to latest version
sudo apt update
sudo apt install --only-upgrade python3-picamera2

# Or if using pip
pip3 install --upgrade picamera2
```

### Port Already in Use

If port 8890 is busy:

```bash
# Check what's using the port
sudo lsof -i :8890

# Kill the process or change port in pi_camera_stream.py (line 243)
```

### Connection Refused from Web Interface

```bash
# Verify service is running
sudo systemctl status pi-camera-stream.service

# Check Pi is reachable
ping mro.local

# Test WebSocket connection manually
sudo apt install -y websocat
websocat ws://mro.local:8890
```

### Firewall Blocking Connection

```bash
# If using UFW firewall, allow port 8890
sudo ufw allow 8890/tcp
sudo ufw reload
```

### No Object Detections Appearing

- Point camera at common objects (people, cups, bottles, etc.)
- Ensure good lighting
- Check logs for detection messages: `sudo journalctl -u pi-camera-stream.service -f`
- Detection threshold is set to 30% confidence (line 182 in script)
- Model supports ~80 object classes from COCO dataset

## Performance Tuning

### Adjust Resolution

Edit `pi_camera_stream.py` line 46-47:

```python
config = camera.create_video_configuration(
    main={"size": (640, 480), "format": "RGB888"},  # Try (320, 240) for lower latency
```

### Adjust Frame Rate

Edit line 48:

```python
controls={"FrameRate": 15},  # Try 10 or 5 for slower networks
```

### Adjust JPEG Quality

Edit line 203:

```python
img.save(buffer, format='JPEG', quality=70)  # Lower = smaller files, faster streaming
```

### Network Performance

For best performance:
- Use 5GHz WiFi if available
- Ensure Pi and client are on same network
- Reduce resolution/quality for remote connections

## Configuration Summary

Default settings in `pi_camera_stream.py`:

| Setting | Value | Line |
|---------|-------|------|
| Resolution | 640x480 | 47 |
| Frame Rate | 15 FPS | 48 |
| JPEG Quality | 70 | 203 |
| WebSocket Port | 8890 | 243 |
| Detection Threshold | 0.3 (30%) | 182 |

## Supported Object Classes

The default SSD MobileNetV2 model detects ~80 object classes including:
- People
- Vehicles (car, truck, bus, motorcycle, bicycle)
- Animals (cat, dog, bird, horse)
- Common objects (cup, bottle, chair, laptop, phone)
- Food items
- And more from the COCO dataset

## System Requirements

- Raspberry Pi OS (64-bit recommended)
- Python 3.9 or later
- At least 1GB free RAM
- Network bandwidth: ~2-5 Mbps for 640x480 @ 15 FPS
