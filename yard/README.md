# Yard - Queue-Based Rover Control System

A clean architecture for controlling the 4tronix rover with separated concerns across devices.

## Architecture Overview

| Device | Hostname | Services |
|--------|----------|----------|
| **Rover** | marspi.local:8523 | Queue-based instruction processor |
| **Satellite** | mro.local:5050 | Web interfaces (`/code/`, `/monitor/`) |
| **Camera** | mro.local:8890 | Pi AI camera WebSocket stream |

## Directory Structure

```
yard/
├── rover/
│   ├── rover_server.py      # Queue-based server for marspi
│   ├── drivers.py           # RoverDriver interface + Real/Mock implementations
│   └── requirements.txt
├── satellite/
│   ├── web_server.py        # Flask server for mro.local (port 5050)
│   ├── camera_server.py     # Pi AI camera WebSocket stream (port 8890)
│   ├── templates/
│   │   ├── code.html        # Tablet Blockly PWA
│   │   └── monitor.html     # TV display (no interaction)
│   ├── static/
│   │   ├── manifest.json    # PWA manifest
│   │   └── service-worker.js
│   └── requirements.txt
└── README.md
```

## Quick Start

### On Rover (marspi.local)

```bash
cd yard/rover
pip install -r requirements.txt
python rover_server.py
```

The server auto-detects if running on a Pi (checks for `/dev/i2c-1`) and uses the appropriate driver:
- **On Pi**: Uses `RealRoverDriver` - controls actual hardware
- **Not on Pi**: Uses `MockRoverDriver` - logs commands to console

### On Satellite (mro.local)

Terminal 1 - Camera Server:
```bash
cd yard/satellite
pip install -r requirements.txt
python camera_server.py
```

Terminal 2 - Web Server:
```bash
cd yard/satellite
python web_server.py
```

### Access Web Interfaces

- **Tablet Blockly Interface**: http://mro.local:5050/code/
- **TV Monitor Display**: http://mro.local:5050/monitor/

## API Reference

### Rover Server API (port 8523)

#### POST /queue/add
Add instruction(s) to the queue.

```bash
curl -X POST http://marspi.local:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 1}}]'
```

**Instruction Format:**
```json
{
  "cmd": "forward|backward|spin_left|spin_right|stop|steer_left|steer_right|wait",
  "params": {"speed": 60, "degrees": 20, "seconds": 1.5}
}
```

#### POST /queue/clear
Clear queue and emergency stop.

```bash
curl -X POST http://marspi.local:8523/queue/clear
```

#### GET /queue/status
Get current, pending, and history.

```bash
curl http://marspi.local:8523/queue/status
```

**Response:**
```json
{
  "current": {...},
  "pending": [...],
  "pending_count": 5,
  "history": [...],
  "history_count": 10
}
```

#### GET /health
Health check endpoint.

```bash
curl http://marspi.local:8523/health
```

### Satellite API (port 5050)

The satellite server proxies all API calls to the rover:

- `POST /api/queue/add` → Proxies to rover
- `POST /api/queue/clear` → Proxies to rover
- `GET /api/queue/status` → Proxies to rover
- `GET /api/health` → Health check with rover connectivity

## Testing

### Test Rover Server (Mock Mode)

On any machine (not Pi):
```bash
cd yard/rover
python rover_server.py
# Logs: "Using MockRoverDriver (not on Pi)"

# Test endpoints:
curl -X POST http://localhost:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 1}}]'

# Watch server output for mock commands:
# [MOCK] Forward at speed 60
# [MOCK] Stop
```

### Test Tablet Client (Mock Mode)

Open in browser with mock parameter:
```
http://localhost:5050/code/?mock=true
```

In mock mode:
- Shows mock output panel below Blockly workspace
- Displays exactly what instructions would be sent
- No network calls - works completely offline

### End-to-End Test

1. Open `/code/` on tablet (no `?mock` parameter)
2. Open `/monitor/` on TV
3. Create simple program (Forward 1s, Spin Left 0.5s, Forward 1s)
4. Click Run (green button)
5. Verify: TV shows queue updating, rover executes sequence
6. Click Stop (red button) mid-execution
7. Verify: Rover stops immediately, queue clears

## Command Reference

| Blockly Block | Instruction cmd | Rover Action |
|---------------|-----------------|--------------|
| Move Forward | `forward` | `rover.forward(speed)` + sleep + stop |
| Move Backward | `backward` | `rover.reverse(speed)` + sleep + stop |
| Spin Left | `spin_left` | `rover.spinLeft(speed)` + LED animation + sleep + stop |
| Spin Right | `spin_right` | `rover.spinRight(speed)` + LED animation + sleep + stop |
| Stop | `stop` | `rover.stop()` |
| Steer Left | `steer_left` | Set servos + `rover.forward(speed)` + sleep + stop |
| Steer Right | `steer_right` | Set servos + `rover.forward(speed)` + sleep + stop |
| Wait | `wait` | Sleep only |

## Configuration

### Environment Variables

**Satellite Web Server:**
- `ROVER_URL` - Rover server URL (default: `http://marspi.local:8523`)

Example:
```bash
ROVER_URL=http://localhost:8523 python web_server.py
```

## Dependency Injection

### Rover Driver

The rover server uses the Driver pattern for testability:

```python
from drivers import create_driver, MockRoverDriver

# Auto-detect (production)
driver = create_driver()

# Force mock for testing
driver = MockRoverDriver()
```

### Tablet Client RoverService

The Blockly interface uses Ports & Adapters for testability:

```javascript
// Real mode (production)
const service = new RealRoverService('/api');

// Mock mode (testing)
const service = new MockRoverService(outputElement);

// Auto-detect via URL parameter
const isMock = new URL(location).searchParams.get('mock') === 'true';
```

## PWA Support

The tablet interface (`/code/`) is a Progressive Web App:

- Installable on tablets
- Works offline (workspace persistence in localStorage)
- Service worker caches Blockly library

To install on iPad:
1. Open Safari to `http://mro.local:5050/code/`
2. Tap Share → Add to Home Screen
3. App launches in fullscreen mode

## Dependencies

### Rover (marspi.local)
- flask>=2.0.0
- RPi.GPIO (pre-installed on Pi)
- rpi_ws281x (for LEDs)
- rover module (4tronix hardware driver)

### Satellite (mro.local)
- flask>=2.0.0
- requests>=2.28.0
- websockets>=10.0
- picamera2 (for camera access)
- numpy
- opencv-python
