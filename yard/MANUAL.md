# Mars Yard Manual

Everything you need to run, install, and fix the Mars Yard. Operational steps
first — installation and debugging follow for when you need them.

The system is three devices:

| Device | Hostname | What it does |
|--------|----------|--------------|
| **Rover** | `marspi.local` (old card) or `curiosity.local` (Bookworm) | Executes queued instructions on the 4tronix M.A.R.S. Rover (port 8523) |
| **Satellite** | `mro.local` | Web server for tablets/TV (port 5050) + camera stream (port 8890) |
| **Tablets / TV** | — | Browser only: kids code at `/code/`, the class watches `/monitor/` |

---

## 1. Running a Session

### Power-on order

1. **Rover** — power on, wait ~1 minute. The mast twitches left then centres
   when the server is ready.
2. **Satellite** — power on. Both services start automatically under systemd.
3. **TV** — open `http://mro.local:5050/monitor/` in a fullscreen browser.
4. **Tablets** — open `http://mro.local:5050/code/` (or launch the installed
   PWA from the home screen).

Everything must be on the same WiFi: **`marsyard`** or **`mars-relay-network`**.

### Check it's all up

Open **`http://mro.local:5050/status`**. Three badges:

| Badge | Green | Amber | Red |
|-------|-------|-------|-----|
| **Satellite** | OK (always green if the page loads) | — | — |
| **Rover** | OK, real hardware | Fake driver — server is up but **not** driving hardware | *Unreachable* (network/power) or *Processor stalled* (accepts commands, never runs them) |
| **Camera** | OK | — | Port closed — camera service down |

Any red: see [Quick Fixes](#2-quick-fixes).

### During the session

- Kids build programs in the **Blockly** tab or write Python in the
  **Python** tab, then press **Run**. The program joins the rover's queue and
  runs in order — one program at a time.
- The TV monitor shows the camera feed plus current / pending / completed
  programs, updating live.
- **Stop** button = emergency stop. It halts the rover immediately, clears
  the queue, and breaks out of running code — including infinite loops.
- Any program running longer than **2 minutes** is stopped automatically and
  shows as an error in the history.
- Work is safe on the tablet: both Blockly blocks and Python code are saved
  in the browser and survive reloads, satellite restarts, and rover reboots.
  (The **Clear** button erases the saved copy too.)

### What auto-recovers (no action needed)

- **WiFi blip / rover reboot** — the monitor's queue panel reconnects by
  itself within seconds; the tablet's status dot goes green again when the
  rover is back. Anything that was queued is gone after a rover reboot — just
  press Run again.
- **Camera restart / unplugged camera** — the monitor retries forever; the
  feed returns by itself once the camera service is back (up to ~40s later).
- **Satellite or rover process crash** — systemd restarts every service
  automatically within 5–10 seconds.

---

## 2. Quick Fixes

Symptom → action, most common first. SSH: user `mars`, password `R0v3r!`.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tablet shows **Disconnected** dot | Rover off / wrong WiFi | Check rover power; confirm tablet is on `marsyard`. Check `/status`. |
| Rover badge **Unreachable** | Rover off, not on WiFi, or wrong rover URL | Power-cycle the rover; wait 1 min. Still red? Check the rover URL shown on `/status` — the **edit** button fixes it live (e.g. `marspi.local` vs `curiosity.local`). |
| Rover badge **Processor stalled** | Queue thread died on the rover | `ssh mars@<rover>.local` then `sudo systemctl restart rover-server` |
| Rover badge **amber (Fake driver)** | Server running without hardware libs | `ssh` to rover, `journalctl -u rover-server -n 50` — usually a missing `PYTHONPATH=/home/mars/marsrover` or hardware lib error. |
| Monitor queue panel frozen | Stale stream connection | It self-heals within ~45s. Or press the **↻** button on the monitor. |
| Camera black on monitor | Camera service down or cable loose | Wait 40s (auto-restart + reconnect). Else `ssh mars@mro.local`, `sudo systemctl restart satellite-camera`; check the ribbon cable. |
| Whole web UI down (`/code/` won't load) | Satellite web service down | `ssh mars@mro.local`, `sudo systemctl restart satellite-web`. If SSH fails, power-cycle the satellite. |
| Rover drives but won't stop | — | Press **Stop** on any tablet. Last resort: pull the rover's power switch. |
| Kid's program "runs forever" | Infinite loop | Press **Stop** — it interrupts loops. After 2 minutes it dies on its own anyway. |

**Last resort: power-cycle everything** in the power-on order above. You lose
only the pending queue. Kids' code is preserved on their tablets.

To check whether the rover hardware itself is fine independently of the web
stack, see [Fallback: drive the rover directly over SSH](#fallback-drive-the-rover-directly-over-ssh).

### Update the code on a Pi

```bash
ssh mars@mro.local            # or marspi.local / curiosity.local
cd /home/mars/4tronix-rover-simulator
git pull
sudo systemctl restart satellite-web satellite-camera   # on the satellite
sudo systemctl restart rover-server                     # on the rover
```

If `mro.local` doesn't resolve, find the IP with `ping mro.local` from
another machine or `arp -a | grep -i raspberry`, then SSH by IP. More options
(keyboard + HDMI) in [docs/satellite.md](docs/satellite.md).

---

## 3. Installation

### Rover Pi

Full walkthroughs: [docs/rover-server.md](docs/rover-server.md) (Bullseye /
`marspi`, including SD-card imaging and headless setup) and
[docs/bookworm-upgrade-plan.md](docs/bookworm-upgrade-plan.md) (Bookworm /
`curiosity`, the verified current setup).

Summary for the Bookworm rover:

1. Flash Raspberry Pi OS Bookworm Lite 32-bit; user `mars`, WiFi `marsyard`,
   enable SSH and I2C/SPI.
2. Install the 4tronix files to `/home/mars/marsrover` (official `rover.sh`),
   clone this repo to `/home/mars/4tronix-rover-simulator`.
3. Create the venv: `python3 -m venv /home/mars/rover-env` and
   `pip install -r yard/rover/requirements.txt`.
4. Install the service:

   ```bash
   cd /home/mars/4tronix-rover-simulator
   sudo cp yard/deploy/rover-server.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now rover-server
   ```

5. Verify: `curl http://localhost:8523/health` →
   `{"status": "ok", "processor_alive": true, "driver": "RealRoverDriver", ...}`

### Satellite Pi

Full walkthrough: [docs/satellite.md](docs/satellite.md).

1. Pi with camera attached, hostname `mro`, user `mars`, WiFi `marsyard`.
2. `sudo apt install -y python3-picamera2`, clone the repo, then
   `python3 -m venv --system-site-packages /home/mars/satellite-env` and
   `pip install -r yard/satellite/requirements.txt`.
3. Install both services:

   ```bash
   cd /home/mars/4tronix-rover-simulator
   sudo cp yard/deploy/satellite-web.service yard/deploy/satellite-camera.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now satellite-web satellite-camera
   ```

4. Make sure the rover URL points at the rover actually deployed
   (`marspi.local` or `curiosity.local`): open
   `http://mro.local:5050/status` and use the **edit** button next to the
   rover URL — the change applies immediately and survives restarts.
5. Verify: `curl http://localhost:5050/api/status` and open
   `http://mro.local:5050/status` from another device.

All three services restart automatically on crash and start on boot. The
camera unit never gives up retrying, so a camera plugged in late is picked up
within ~10 seconds.

### Tablets and TV

- Tablets: Safari/Chrome → `http://mro.local:5050/code/` → Add to Home
  Screen for fullscreen PWA.
- TV: any browser fullscreen on `http://mro.local:5050/monitor/`.

---

## 4. Debugging

### Logs

```bash
# Satellite
journalctl -u satellite-web -f
journalctl -u satellite-camera -f

# Rover
journalctl -u rover-server -f
```

### Health endpoints

```bash
curl http://<rover>.local:8523/health     # rover: status, processor_alive, driver, queue_size
curl http://mro.local:5050/api/status     # everything the /status page shows, as JSON
curl http://mro.local:5050/api/health     # satellite + rover connectivity
curl http://<rover>.local:8523/queue/status   # current/pending/history
```

A rover `"status": "degraded"` means the queue processor thread is not
running — restart `rover-server`.

### Testing without hardware

- The rover server falls back to a **fake driver** automatically when the
  4tronix libraries aren't present, so the full stack runs on a laptop:
  `python yard/rover/rover_server.py` plus
  `ROVER_URL=http://localhost:8523 python yard/satellite/web_server.py`.
- The tablet UI has an offline spy mode: `/code/?spy=true` shows what would
  be sent without any network calls.
- Test suites (see [docs/testing.md](docs/testing.md)):

  ```bash
  cd yard/rover && ../venv/bin/python -m pytest -v          # service + HTTP + SSE
  cd yard/satellite && ../venv/bin/python -m pytest tests/ -v   # status page (Playwright) + SSE proxy
  ```

### Fallback: drive the rover directly over SSH

If the web stack is down (or you want to rule it out), you can bypass the
whole satellite/queue pipeline and tele-operate the rover from a keyboard.
The direct drive script and the rover server both want the hardware, so
stop the server first:

```bash
ssh mars@marspi.local            # or curiosity.local
sudo systemctl stop rover-server
./drive.sh                       # runs sudo python marsrover/driveRover.py
```

Controls: **arrow keys** (or `w`/`a`/`s`/`d`) to steer, `,`/`.` to slow
down/speed up, **space** to coast to a stop, `b` to brake, **Ctrl-C** to
quit. When you're done, hand the hardware back to the queue server:

```bash
sudo systemctl start rover-server
```

If `./drive.sh` works but the web stack doesn't, the hardware and 4tronix
libraries are fine — debug upwards from `curl http://localhost:8523/health`
on the rover. There's also `./cam.sh` on the rover for a quick local
camera preview (only useful with a monitor attached).

### Known limitations

- **Pending queue is lost on rover reboot** — by design; kids press Run again.
- **Code blocked inside a C/hardware call can't be interrupted mid-call** —
  the Stop button and the 2-minute timeout act on the next Python line.
- **`*.local` hostnames need mDNS** — if a device can't resolve them, fall
  back to IP addresses (find them on the `/status` page or via `ping`).
- The camera requires the Pi AI Camera (IMX500); on other cameras the
  detection overlays are absent.

### Deep dives

| Doc | Contents |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | System design, SSE push, ports & adapters |
| [docs/api.md](docs/api.md) | REST endpoints, instruction format |
| [docs/rover-server.md](docs/rover-server.md) | Rover Pi setup from blank SD card |
| [docs/satellite.md](docs/satellite.md) | Satellite services, tablet/TV interfaces |
| [docs/testing.md](docs/testing.md) | Test suites and how to run them |
