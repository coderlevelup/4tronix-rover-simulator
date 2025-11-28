# Web Interface for 4tronix M.A.R.S. Rover

A web control interface with Blockly programming for the 4tronix M.A.R.S. Rover.

## Features

- **Blockly Visual Programming**: Drag-and-drop programming interface with time-based movement blocks
- **Real-time Rover Control**: Direct control via web interface
- **Dual Target Support**: Toggle between simulator and real rover without restarting
- **AI Camera Integration**: Live camera feed from Pi AI Camera with IMX500 object detection
- **WebSocket Streaming**: Low-latency video streaming with bounding boxes
- **Responsive Design**: Works on mobile and desktop

## Installation

### Local Development

1. Create and activate virtual environment (from the main project directory):
```bash
python -m venv venv
source venv/bin/activate  # Linux/macOS
.\venv\Scripts\activate   # Windows
```

2. Install dependencies:
```bash
pip install flask requests
```

3. Run the simulator (from the main project directory):
```bash
python roversimui.py
```

4. In another terminal, run the web interface:
```bash
cd web_interface
python web_interface.py
```

### Raspberry Pi 5 Deployment (with AI Camera)

The web interface is designed to run on the Pi 5 alongside the camera stream.

#### 1. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python packages
sudo apt install -y python3-flask python3-requests

# Or use pip
pip3 install flask requests
```

#### 2. Clone or Update Repository on Pi 5

```bash
# On the Pi 5 (first time)
git clone https://github.com/coderlevelup/4tronix-rover-simulator.git
cd 4tronix-rover-simulator

# Or update existing repository
cd ~/4tronix-rover-simulator
git pull
```

#### 3. Test Manual Run

```bash
cd ~/4tronix-rover-simulator/web_interface
python3 web_interface.py
```

The web interface will start on port 5001 (or port 80 if running as root).

#### 4. Auto-Start with Systemd (Recommended)

Create systemd service:

```bash
sudo nano /etc/systemd/system/rover-web-interface.service
```

Add this content:

```ini
[Unit]
Description=4tronix Rover Web Interface
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/4tronix-rover-simulator/web_interface
Environment=PYTHONPATH=/home/pi/4tronix-rover-simulator
ExecStart=/usr/bin/python3 /home/pi/4tronix-rover-simulator/web_interface/web_interface.py
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
sudo systemctl enable rover-web-interface.service

# Start the service now
sudo systemctl start rover-web-interface.service

# Check status
sudo systemctl status rover-web-interface.service
```

#### 5. Service Management Commands

```bash
# Stop the web interface
sudo systemctl stop rover-web-interface.service

# Restart the web interface
sudo systemctl restart rover-web-interface.service

# Disable auto-start on boot
sudo systemctl disable rover-web-interface.service

# View live logs
sudo journalctl -u rover-web-interface.service -f

# View recent logs (last 50 lines)
sudo journalctl -u rover-web-interface.service -n 50
```

## Usage

Access the web interface at:
- **Local development**: http://localhost:5001
- **Pi 5 (mro.local)**: http://mro.local:5001
- **Pi 5 (IP address)**: http://192.168.x.x:5001

### Switching Between Simulator and Real Rover

The web interface supports two targets:

1. **Simulator Mode**:
   - Connects to: `http://127.0.0.1:8523/`
   - Use for development and testing
   - Requires `roversimui.py` running

2. **MarsPI Mode** (real rover - default):
   - Connects to: `http://marspi.local:8523/`
   - Use to control the real rover
   - Requires rover server running on the Pi Zero:
     ```bash
     # On the rover Pi Zero
     sudo systemctl status rover-server.service
     ```

**To switch targets:**
- Use the radio buttons at the top of the interface
- Select "Simulator" or "MarsPI (Real Rover)"
- Connection automatically switches to selected target

### Connecting to the Camera Stream

When running on Pi 5:

1. Ensure the camera stream service is running:
   ```bash
   sudo systemctl status pi-camera-stream.service
   ```

2. In the web interface:
   - Select "MarsPI (Real Rover)" radio button
   - Enter camera hostname: `localhost` (when on Pi 5) or `mro.local` (when remote)
   - Enter camera port: `8890`
   - Click "Connect"

The camera feed will appear with object detection bounding boxes.

## Blockly Programming

The Blockly interface provides visual programming blocks:

### Available Blocks

- **Movement Blocks**:
  - Move Forward (time in seconds)
  - Move Backward (time in seconds)
  - Spin Left (time in seconds)
  - Spin Right (time in seconds)
  - Wait (time in seconds)

- **Control Blocks**:
  - Repeat (loop a number of times)

- **Variables**:
  - Create and use variables
  - Set variable values
  - Use variables in movement blocks

### Running Code

1. Drag blocks from the toolbox to the workspace
2. Configure time values (in seconds)
3. Click "Run Code" to execute on the rover
4. Click "Stop Rover" to halt movement

Code runs as a sequence, waiting for each command to complete before starting the next.

## API Endpoints

### Target Management

```bash
# Get current target
GET /target

# Switch to simulator
POST /target/simulator

# Switch to real rover
POST /target/marspi
```

### Command Control

```bash
# Forward
POST /command/forward
Body: {"speed": 100}

# Backward
POST /command/backward
Body: {"speed": 100}

# Spin left
POST /command/spin_left
Body: {"speed": 100}

# Spin right
POST /command/spin_right
Body: {"speed": 100}

# Stop
POST /command/stop

# Turn forward (differential)
POST /command/turn_forward
Body: {"leftSpeed": 80, "rightSpeed": 100}

# Turn reverse (differential)
POST /command/turn_reverse
Body: {"leftSpeed": 80, "rightSpeed": 100}
```

### Sequence Execution

```bash
POST /sequence
Body: {
  "sequence": [
    {"cmd": "forward", "time": 1.0},
    {"cmd": "spin_right", "time": 0.5},
    {"cmd": "forward", "time": 2.0}
  ]
}
```

## Troubleshooting

### Web Interface Won't Start

Check logs:
```bash
sudo journalctl -u rover-web-interface.service -n 50
```

Common issues:
- Missing dependencies: `pip3 install flask requests`
- Wrong file path: Verify paths in service file
- Port already in use: Check port 5001 with `sudo lsof -i :5001`

### Can't Connect to Rover

**For Simulator:**
- Ensure `roversimui.py` is running: `ps aux | grep roversimui`
- Check simulator is on port 8523

**For Real Rover:**
- Verify rover server is running: `ssh pi@marspi.local "sudo systemctl status rover-server.service"`
- Check network connectivity: `ping marspi.local`
- Ensure rover Pi Zero is powered and on same network

### Camera Feed Not Working

Check camera stream service:
```bash
# On Pi 5
sudo systemctl status pi-camera-stream.service
sudo journalctl -u pi-camera-stream.service -n 50
```

Common issues:
- Missing IMX500 models: `sudo apt install -y imx500-all`
- Camera not detected: `libcamera-hello --list-cameras`
- Wrong hostname: Use `localhost` when accessing from Pi 5 itself

### Object Detection Not Showing

- Install models: `sudo apt install -y imx500-all`
- Check logs: `sudo journalctl -u pi-camera-stream.service -f`
- Point camera at common objects (people, cups, books, etc.)
- Ensure good lighting

## Files

- `web_interface.py` - Main Flask application with rover control
- `templates/index.html` - Blockly interface and controls
- `templates/rtc_index.html` - Alternative interface (experimental)
- `run_simple.py` - Simple launcher script
- `run_server.py` - Server launcher script

## Network Configuration

The web interface binds to `0.0.0.0:5001` by default, making it accessible from:
- Localhost: `http://localhost:5001`
- Local network: `http://mro.local:5001`
- IP address: `http://192.168.x.x:5001`

Port defaults:
- Development (non-root): Port 5001
- Production (root): Port 80

## System Architecture

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│  Browser    │  HTTP    │  Web         │  HTTP    │  Rover      │
│  (User)     │◄────────►│  Interface   │◄────────►│  Server     │
│             │  :5001   │  (Pi 5)      │  :8523   │  (Pi Zero)  │
└─────────────┘          └──────────────┘          └─────────────┘
                               │
                               │ WebSocket
                               │ :8890
                               ▼
                         ┌──────────────┐
                         │  Camera      │
                         │  Stream      │
                         │  (Pi 5)      │
                         └──────────────┘
```

## Notes

- Default target is now `marspi` (real rover)
- Camera stream uses WebSocket for low latency
- Object detection runs at 15 FPS with 30% confidence threshold
- Bounding boxes show confidence percentage only (not object names)
- Time-based movement allows for predictable robot behavior
- All movement commands are non-blocking and queued
