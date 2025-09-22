# Web Interface for 4tronix M.A.R.S. Rover

A web control interface for the 4tronix M.A.R.S. Rover.

**Note:** This is experimental and may not work reliably. It's primarily designed for interactive activities with beginners.

## Setup

### Local Development

1. Create and activate virtual environment (from the main project directory):
```bash
python -m venv env
source env/bin/activate  # Linux
.\env\Scripts\activate   # Windows
```

2. Install dependencies:
```bash
pip install flask requests pyqt6
```

3. Run the simulator (from the main project directory):
```bash
python roversimui.py
```

4. In another terminal, run the web interface (from the main project directory):
```bash
python web_interface/web_interface.py
```

Or use the convenience scripts (from the web_interface directory):
```bash
python run_simple.py
# or
python run_server.py
```

Or from the main project directory:
```bash
python web_interface/run_simple.py
# or
python web_interface/run_server.py
```

### Raspberry Pi Deployment

#### Camera Setup
To enable the camera feed on the real rover:

1. Install UV4L for WebRTC support:
```bash
# Add UV4L repository
curl https://www.linux-projects.org/listing/uv4l_repo/lpkey.asc | sudo apt-key add -
echo "deb https://www.linux-projects.org/listing/uv4l_repo/raspbian/stretch stretch main" | sudo tee /etc/apt/sources.list.d/uv4l.list

# Install UV4L and required components
sudo apt-get update
sudo apt-get install uv4l uv4l-raspicam uv4l-server uv4l-webrtc
```

2. Configure UV4L:
```bash
sudo nano /etc/uv4l/uv4l-raspicam.conf
```
Add/modify these settings:
```
server-option = --port=8080
server-option = --enable-webrtc=yes
server-option = --enable-hwenc=yes
server-option = --width=640
server-option = --height=480
server-option = --framerate=10
```

3. Restart UV4L:
```bash
sudo service uv4l_raspicam restart
```

#### Autostart Web Interface

1. Copy the project to the Raspberry Pi:
```bash
sudo mkdir -p /home/mars/4tronix-rover-simulator
sudo cp -r * /home/mars/4tronix-rover-simulator/
```

2. Create virtual environment and install dependencies:
```bash
cd /home/mars/4tronix-rover-simulator
python3 -m venv env
source env/bin/activate
pip install flask requests
```

3. Create systemd service:
```bash
sudo nano /etc/systemd/system/rover-web.service
```
Add:
```ini
[Unit]
Description=Rover Web Control Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/mars/4tronix-rover-simulator
ExecStart=/home/mars/4tronix-rover-simulator/env/bin/python web_interface/web_interface.py
Restart=always

[Install]
WantedBy=multi-user.target
```

4. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rover-web
sudo systemctl start rover-web
```

The web interface will now:
- Start automatically on boot
- Run on port 80 when running as root
- Display camera feed from UV4L
- Restart automatically if it crashes

## Usage

Access the web interface at:
- Development: http://localhost:5000
- Production: http://[raspberry-pi-ip]

## Features

- Real-time rover control via web interface
- Camera feed integration (on Raspberry Pi)
- Sequence programming for automated movements
- Responsive design for mobile and desktop

## Files

- `web_interface.py` - Main Flask application
- `templates/index.html` - Web interface HTML template
