# Satellite Server

The satellite (mro.local) hosts the web interfaces and camera stream, acting as the bridge between tablets/TVs and the rover.

## Services

| Port | Service | Description |
|------|---------|-------------|
| 5050 | Web Server | Flask app serving Blockly IDE and monitor |
| 8890 | Camera Server | WebSocket streaming Pi AI camera frames |

## Setup

```bash
cd yard/satellite
pip install -r requirements.txt

# Terminal 1: Camera
python camera_server.py

# Terminal 2: Web server
python web_server.py
```

## Web Server (port 5050)

### Routes

| Route | Description |
|-------|-------------|
| `/` | Links to code and monitor |
| `/code/` | Tablet Blockly interface (PWA) |
| `/monitor/` | TV display - camera feed + queue status |

### API Proxy

All `/api/*` requests are proxied to the rover server:

| Satellite | Rover |
|-----------|-------|
| `POST /api/queue/add` | `POST /queue/add` |
| `POST /api/queue/clear` | `POST /queue/clear` |
| `GET /api/queue/status` | `GET /queue/status` |
| `GET /api/health` | Local + rover health |

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ROVER_URL` | `http://marspi.local:8523` | Rover server URL |

```bash
ROVER_URL=http://localhost:8523 python web_server.py
```

## Camera Server (port 8890)

WebSocket server streaming JPEG frames from Pi AI Camera (IMX500).

### Connect

```javascript
const ws = new WebSocket('ws://mro.local:8890');
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'frame') {
        img.src = 'data:image/jpeg;base64,' + msg.data;
    }
};
```

### Features

- 15 FPS JPEG stream
- IMX500 AI object detection with bounding boxes
- Supports multiple connected clients
- Auto-reconnection handling

## Tablet Interface (/code/)

### Features

- Full-screen Blockly workspace
- Run button → POST instructions to queue
- Stop button → Emergency stop
- PWA support (installable, works offline)
- Workspace persistence to localStorage

### Mock Mode

```
http://mro.local:5050/code/?mock=true
```

Shows what instructions would be sent without making network calls.

### Ports & Adapters

```javascript
// Real mode (production)
const service = new RealRoverService('/api');

// Mock mode (testing)
const service = new MockRoverService(outputElement);

// Auto-detect via URL parameter
const isMock = new URL(location).searchParams.get('mock') === 'true';
```

### PWA Installation (iPad)

1. Open Safari to `http://mro.local:5050/code/`
2. Tap Share → Add to Home Screen
3. App launches in fullscreen mode

## TV Monitor (/monitor/)

### Layout

```
┌────────────────────────────┬──────────────┐
│                            │   Current    │
│                            │   Pending    │
│      Camera Feed           │   History    │
│        (2/3)               │    (1/3)     │
│                            │              │
└────────────────────────────┴──────────────┘
```

### Features

- Auto-connects to camera WebSocket
- Polls queue status every 500ms
- Dark theme for TV display
- No interaction required

## Dependencies

```
flask>=2.0.0
requests>=2.28.0
websockets>=10.0
picamera2
numpy
opencv-python
```

Note: `picamera2` and camera features only work on Raspberry Pi with Pi AI Camera.
