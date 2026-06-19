# MacBook Satellite Setup

How to run the Mars Yard **satellite** on a MacBook instead of a Raspberry Pi. The rover
is unchanged — it still runs on its own Pi at `marspi.local`/`curiosity.local:8523`.

## When to use this

- No spare satellite Pi, or using a laptop as a quick demo rig.
- You want a higher-quality overhead camera than the Pi AI cam (a good USB webcam on a
  gooseneck gives a better classroom shot).
- Running the system entirely on a desk without any extra Pi hardware.

**What changes:** the satellite host (Mac instead of Pi) and its overhead camera (Mac webcam
instead of IMX500 Pi AI cam).

**What doesn't change:** the rover Pi, the mast camera (still the Pi's CSI camera), the
take-a-picture block, the tablet and TV browser experience, the `/code/` and `/monitor/` URLs.

## Requirements

- macOS (tested on Ventura / Sonoma)
- Python 3.10+
- A webcam — built-in FaceTime HD or any USB camera
- Terminal (or iTerm2) — must have **Camera permission** (below)
- The rover Pi on the same WiFi

## Install

```bash
cd yard/satellite

# Create a Mac-specific venv (omits picamera2 which won't pip-install on macOS)
python3 -m venv mac-env
mac-env/bin/pip install -r requirements-mac.txt
```

> If you accidentally use `requirements.txt` instead, `pip` will error on `picamera2`.
> Use `requirements-mac.txt`.

### Grant camera permission

The first time the camera server starts, macOS shows a **Camera access** dialog.
Grant it to Terminal (or iTerm2). If you miss it:

**System Settings → Privacy & Security → Camera → enable Terminal / iTerm2**

You only need to do this once. If frames are black/empty, this is almost always why.

## Running

```bash
cd yard/satellite
./start-mac.sh
```

This starts both services in the foreground:

| Service | Port | URL |
|---------|------|-----|
| Web server (`web_server.py`) | 5050 | `http://localhost:5050` |
| Camera stream (`mac_camera_server.py`) | 8890 | `ws://localhost:8890` |
| Camera control API | 8891 | `http://localhost:8891` (internal) |

Press **Ctrl-C** to stop both.

### Manual start (two terminals)

```bash
# Terminal 1
cd yard/satellite && mac-env/bin/python web_server.py

# Terminal 2
cd yard/satellite && mac-env/bin/python mac_camera_server.py
```

### Camera picker flags

```bash
# List all detected cameras and exit
mac-env/bin/python mac_camera_server.py --list

# Start on a specific camera index
mac-env/bin/python mac_camera_server.py --camera 1

# Adjust frame rate or JPEG quality
mac-env/bin/python mac_camera_server.py --fps 10 --quality 70
```

You can also switch cameras **live** from the `/status` page (see below).

## Connecting tablets and TV

Make sure the Mac, tablets, TV, and rover Pi are all on the same WiFi:
**`marsyard`** or **`mars-relay-network`**.

The Mac is reachable via its Bonjour name (usually `<your-mac-name>.local`) or its IP.
Find the IP with:

```bash
ipconfig getifaddr en0    # or en1 for some Macs
```

| Device | URL |
|--------|-----|
| **Tablets** | `http://<mac-name>.local:5050/code/` |
| **TV** | `http://<mac-name>.local:5050/monitor/` |
| **Status** | `http://<mac-name>.local:5050/status` |

The TV monitor auto-connects its camera stream to whatever host served the page, so it
will use the Mac's camera automatically — no `mro.local` alias needed.

## Setting the rover URL

Open `http://localhost:5050/status` and click **edit** next to the Rover URL.
Enter `http://marspi.local:8523` (or `http://curiosity.local:8523` for the Bookworm card).
The URL is saved to `satellite_config.json` and survives restarts.

## Picking the camera source

On `http://localhost:5050/status`, the **Camera** card shows a **Source** dropdown
(this appears only on the Mac — on the Pi there is no control server and the dropdown
stays hidden). Select a camera from the list; the stream switches immediately.

If the dropdown is empty or missing:
- The Mac camera server isn't running yet — check the terminal.
- macOS Camera permission not granted — see above.

## Offline UI testing (no rover needed)

Open `http://localhost:5050/code/?spy=true`

This uses a fake rover driver in the browser; the queue display and Run/Stop buttons work
without a real rover on the network.

## Differences from the Pi satellite

| | Pi satellite (`mro.local`) | Mac satellite |
|--|--|--|
| Camera server | `camera_server.py` (IMX500/picamera2) | `mac_camera_server.py` (OpenCV/AVFoundation) |
| Object detection | Yes (IMX500 neural network) | No |
| Service management | systemd (`satellite-web.service`, `satellite-camera.service`) | Foreground via `start-mac.sh` |
| Auto-start on boot | Yes | No (run manually, or add a launchd plist) |
| Camera picker on /status | No | Yes |
| TV camera URL | `ws://mro.local:8890` (hardcoded before this change) | `ws://<serving-host>:8890` (auto) |

## Optional: auto-start on login (launchd)

If you want the satellite to start automatically when you log into the Mac:

```bash
# Create ~/Library/LaunchAgents/mars.satellite.plist
# (adjust the paths for your setup)
cat > ~/Library/LaunchAgents/mars.satellite.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>mars.satellite</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/path/to/yard/satellite/start-mac.sh</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/mars-satellite.log</string>
    <key>StandardErrorPath</key><string>/tmp/mars-satellite.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/mars.satellite.plist
```

Note: macOS camera permission must be granted to the launching app (Terminal or the
launchd process), which may require an interactive first run.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Camera frames black / empty | Camera permission denied | System Settings → Privacy → Camera → enable Terminal |
| `/status` Camera badge red | `mac_camera_server.py` not running | Start it; or check `./start-mac.sh` output |
| Camera dropdown missing | Control API not reachable | `mac_camera_server.py` not running, or wrong `--control-port` |
| Tablets can't reach Mac | Different WiFi subnet | Join `marsyard` / `mars-relay-network` on both |
| Monitor shows `mro.local` in camera error | Old browser cache | Hard-refresh (Cmd-Shift-R) |
| `picamera2` pip error | Wrong requirements file | Use `requirements-mac.txt` not `requirements.txt` |
