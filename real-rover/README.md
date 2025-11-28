# Real Rover Server

This directory contains the server to control the actual 4tronix M.A.R.S. Rover hardware.

## Files

- **rover.py**: Official 4tronix rover control library (from http://4tronix.co.uk/rover/rover.py)
- **rover_server.py**: HTTP server that exposes the same API as the simulator UI

## Installation

### 1. Install Dependencies

On the Raspberry Pi connected to the rover:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python packages
sudo apt install -y python3-flask

# Install 4tronix rover library
pip3 install 4tronix-marsrover

# Or install from requirements
pip3 install flask RPi.GPIO rpi_ws281x smbus
```

### 2. Copy Files to Raspberry Pi

```bash
# From your development machine
scp -r real-rover pi@marspi.local:~/4tronix-rover-simulator/
```

## Usage

### Manual Start

```bash
cd ~/4tronix-rover-simulator/real-rover
python3 rover_server.py
```

The server will start on port 8523 and accept HTTP POST requests.

You should see:
```
Initializing M.A.R.S. Rover hardware...
Rover initialized successfully
Starting HTTP server on port 8523...
Server ready to accept commands
```

### Auto-Start with Systemd (Recommended)

To have the rover server start automatically on boot:

#### 1. Create Systemd Service

```bash
sudo nano /etc/systemd/system/rover-server.service
```

Add this content:

```ini
[Unit]
Description=4tronix M.A.R.S. Rover HTTP Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/4tronix-rover-simulator/real-rover
Environment=PYTHONPATH=/home/pi/4tronix-rover-simulator
ExecStart=/usr/bin/python3 /home/pi/4tronix-rover-simulator/real-rover/rover_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 2. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable rover-server.service

# Start the service now
sudo systemctl start rover-server.service

# Check status
sudo systemctl status rover-server.service
```

#### 3. Service Management Commands

```bash
# Stop the rover server
sudo systemctl stop rover-server.service

# Restart the rover server
sudo systemctl restart rover-server.service

# Disable auto-start on boot
sudo systemctl disable rover-server.service

# View live logs
sudo journalctl -u rover-server.service -f

# View recent logs (last 50 lines)
sudo journalctl -u rover-server.service -n 50
```

## Controlling the Rover

### From your development machine:

Run your rover control programs (the same ones you use with the simulator):

```bash
python3 square.py
python3 move-rover.py
```

Just make sure `roversimulator.py` points to your Raspberry Pi's address:

```python
simulatorUiUrl = "http://marspi.local:8523/"
```

### Using the Web Interface

Access the web interface at `http://mro.local:5001` (if running on Pi 5) or run it locally and point it to `http://marspi.local:8523/`.

## API

The server accepts the same JSON format as `roversimui.py`:

### Request Format

```json
{
  "wheelMotors": {
    "l": [100, 0],  // [forward_speed, reverse_speed]
    "r": [100, 0]
  },
  "servos": {
    "0": 90,  // servo_id: degrees
    "1": 45
  },
  "rgbLeds": {
    "0": [255, 0, 0],  // led_id: [r, g, b]
    "1": [0, 255, 0]
  }
}
```

### Response Format

```json
{
  "ultrasonicRange": 80.5
}
```

### Example cURL Request

```bash
curl -X POST http://marspi.local:8523/ \
  -H "Content-Type: application/json" \
  -d '{"wheelMotors": {"l": [100, 0], "r": [100, 0]}}'
```

## Troubleshooting

### Service Won't Start

Check logs:
```bash
sudo journalctl -u rover-server.service -n 50
```

Common issues:
- Missing dependencies: `pip3 install 4tronix-marsrover flask`
- Wrong file path: Verify paths in service file
- GPIO permissions: Service runs as `pi` user (should have GPIO access)

### Port Already in Use

Check what's using port 8523:
```bash
sudo lsof -i :8523
```

Kill the process or change port in `rover_server.py` line 142.

### Hardware Not Responding

- Check rover is powered on
- Verify battery level
- Check all connections
- Test with simple rover commands:
  ```python
  import rover
  rover.init(40)
  rover.forward(50)
  rover.stop()
  ```

### Connection Refused from Web Interface

- Ensure service is running: `sudo systemctl status rover-server.service`
- Verify Pi is reachable: `ping marspi.local`
- Check firewall: `sudo ufw allow 8523/tcp`

## Network Configuration

The server binds to `0.0.0.0:8523`, making it accessible from:
- Localhost: `http://localhost:8523`
- Local network: `http://marspi.local:8523`
- IP address: `http://192.168.x.x:8523`

## Notes

- The rover server will automatically initialize the rover with brightness 40
- GPIO access is handled by the rover library
- Servo positions are in degrees (-90 to +90)
- Motor speeds range from 0 to 100
- RGB LED values range from 0 to 255
