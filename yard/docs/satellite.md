# Satellite Server

The satellite (mro.local) hosts the web interfaces and camera stream, acting as the bridge between tablets/TVs and the rover.

## Services

| Port | Service | Description |
|------|---------|-------------|
| 5050 | Web Server | Flask app serving Blockly IDE and monitor |
| 8890 | Camera Server | WebSocket streaming Pi AI camera frames |

## Setup

### Install as systemd services (recommended)

Both services should run under systemd so they start on boot and restart
automatically after a crash (the camera unit retries every 10s forever, so an
unplugged camera recovers as soon as it's reconnected).

First check what's already on the Pi — an existing venv or manually started
processes:

```bash
ps aux | grep -E 'web_server|camera_server' | grep -v grep
ls -d /home/mars/*env* 2>/dev/null
```

Create the venv if it doesn't exist (`--system-site-packages` is required —
`picamera2` comes from apt, not pip):

```bash
sudo apt install -y python3-picamera2
python3 -m venv --system-site-packages /home/mars/satellite-env
/home/mars/satellite-env/bin/pip install -r /home/mars/4tronix-rover-simulator/yard/satellite/requirements.txt
```

Install and enable the units (from the repo's `yard/deploy/` directory):

```bash
cd /home/mars/4tronix-rover-simulator
sudo cp yard/deploy/satellite-web.service yard/deploy/satellite-camera.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now satellite-web satellite-camera
```

Check the rover hostname in `satellite-web.service` (`Environment=ROVER_URL=...`)
matches the rover actually deployed — `marspi.local` (old card) or
`curiosity.local` (Bookworm). Edit `/etc/systemd/system/satellite-web.service`
and `sudo systemctl daemon-reload && sudo systemctl restart satellite-web` if not.

Watch logs:

```bash
journalctl -u satellite-web -f
journalctl -u satellite-camera -f
```

### Running manually (development)

```bash
cd yard/satellite
pip install -r requirements.txt

# Terminal 1: Camera
python camera_server.py

# Terminal 2: Web server
python web_server.py
```

## Updating the Satellite (Manual Steps)

Use these steps if you can't SSH to the satellite and need to update the code by hand (e.g. the Pi is on a different network, or SSH is unavailable).

### What you need
- A laptop on the same WiFi network as the satellite (`marsyard` or `mars-relay-network`)
- USB keyboard + HDMI monitor, **or** physical access to connect one

### Option A — SSH from a laptop on the same network

```bash
ssh mars@mro.local
cd /home/mars/4tronix-rover-simulator
git pull
# Then restart services (see below)
```

If `mro.local` doesn't resolve, find the IP first:
```bash
# From another Pi or Mac on the same network:
ping mro.local
# or
arp -a | grep -i raspberry
```

Then SSH by IP: `ssh mars@<ip-address>`

### Option B — USB keyboard + screen directly on the Pi

1. Plug in keyboard and HDMI monitor
2. Log in: user `mars`, password `R0v3r!`
3. Open a terminal (right-click desktop → Terminal, or it may boot to terminal)

```bash
cd /home/mars/4tronix-rover-simulator
git pull
```

### Restarting services after update

**If running under systemd** (auto-start on boot):
```bash
sudo systemctl restart satellite-web satellite-camera
sudo systemctl status satellite-web       # check it started ok
```

**If running manually in a terminal** (started by hand):
```bash
# Kill the old processes
pkill -f web_server.py
pkill -f camera_server.py

# Start again
cd /home/mars/4tronix-rover-simulator/yard/satellite
python web_server.py &
python camera_server.py &
```

**If you're not sure how it's running:**
```bash
ps aux | grep -E 'web_server|camera_server' | grep -v grep
```

If you see the process listed with a systemd service path, use `systemctl restart`. If it shows a manual terminal session, kill and restart manually.

### Verify it worked

```bash
curl http://localhost:5050/api/health
```

Should return JSON with `"status": "ok"`. If the rover is also running you'll see `"rover_status": "connected"`.

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
| `GET /api/queue/events` | `GET /queue/events` (SSE stream proxy) |
| `GET /api/health` | Local + rover health |

`/api/queue/events` is a persistent streaming response. The satellite opens one `requests.get(..., stream=True, timeout=(3.05, 45))` connection to the rover and forwards raw bytes to the browser. It does not parse or buffer SSE events. The rover emits a heartbeat comment every 30s of idle, so the 45s read timeout only fires when the rover has died without closing the socket — the proxy then ends the response and the browser's `EventSource` reconnects automatically.

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
- Workspace persistence to localStorage (both Blockly and Python tabs)

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

### Spy Mode

```
http://mro.local:5050/code/?spy=true
```

Shows what instructions would be sent without making network calls
(`?mock=true` still works as a legacy alias).

### Ports & Adapters

```javascript
// Real mode (production)
const service = new RealRoverService('/api');

// Spy mode (testing) — records and displays what would be sent
const service = new SpyRoverService(outputElement);

// Auto-detect via URL parameter (?spy=true, or legacy ?mock=true)
const isSpyMode = urlParams.get('spy') === 'true' || urlParams.get('mock') === 'true';
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
- Receives queue updates via SSE push (no polling)
- Only re-renders when queue data changes (no flicker)
- ↻ refresh button for a one-off manual fetch
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
