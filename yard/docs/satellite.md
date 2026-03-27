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

### Tabs

The code interface has two tabs:

| Tab | Description |
|-----|-------------|
| **Blockly** | Visual block editor — drag and drop rover blocks |
| **Python** | Monaco code editor — write Python directly |

Both tabs submit a `run_python` instruction when Run is pressed. Blockly submissions also include the serialised workspace state (`blockly_state`) so the monitor can display the original blocks.

### Features

- Blockly workspace with 9 rover block types (movement, steering, control)
- Python tab with Monaco editor (syntax highlighting, dark theme)
- Run button → POST `run_python` instruction to queue
- Stop button → Emergency stop
- Clear button → Clears workspace or editor
- PWA support (installable, works offline)
- Workspace persistence to localStorage (Blockly tab only)

### Block Types

| Block | Colour | Parameters |
|-------|--------|------------|
| Move Forward | Blue | time (seconds) |
| Move Backward | Blue | time (seconds) |
| Spin Left | Purple | time (seconds) |
| Spin Right | Purple | time (seconds) |
| Stop | Red | — |
| Steer Left | Cyan | degrees, time |
| Steer Right | Cyan | degrees, time |
| Wait | Green | time (seconds) |
| Repeat | Orange | times, inner blocks |

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
- Only re-renders when queue data changes (no flicker)
- Dark theme for TV display
- No interaction required

### Instruction Display

Instructions in the queue panel render differently depending on their source:

| Source | Display |
|--------|---------|
| Blockly tab | Read-only Blockly workspace preview (160px tall) |
| Python tab | Code block with syntax-coloured text |

The label also differs: **Run Blockly** vs **run python**.

### Rover Badge Popover

Clicking the "Connected / Disconnected" badge in the queue panel opens a popover showing:
- **Rover URL** — the URL the satellite is proxying to
- **Rover** — live connection status (`connected`, `disconnected`, `timeout`, `error`)

Click anywhere else to dismiss.

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
