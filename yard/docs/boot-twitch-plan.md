# Boot Twitch Plan

A three-stage mast animation that plays out across the Pi boot sequence, giving visual feedback on boot progress.

## Behaviour

| Stage | Trigger | Mast position |
|-------|---------|---------------|
| 1 | Early OS boot (pre-network) | 15° left |
| 2 | Rover server begins initialising | 30° left |
| 3 | Rover server ready | 0° (centre) |

## Implementation

### Stage 1 — Early boot systemd service

Create `/home/mars/mast-boot.py` — a minimal script using `smbus` directly (no rover library) to move servo 0 to 15°. Keeps it lightweight and fast.

Create `/etc/systemd/system/mast-boot.service`:

```ini
[Unit]
Description=Mast early boot position
After=local-fs.target
Before=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /home/mars/mast-boot.py

[Install]
WantedBy=sysinit.target
```

### Stage 2 & 3 — rover_server.py

In `main()`, add servo moves around the existing init:

```python
def main():
    # Stage 2: server starting — mast to 30° left (thinking)
    rover.init(40)
    rover.setServo(0, -30)

    # ... existing init work ...

    # Stage 3: server ready — centre mast, LEDs white
    rover.setServo(0, 0)
    white = rover.fromRGB(255, 255, 255)
    for i in range(4):
        rover.setPixel(i, white)
    rover.show()

    app.run(host='0.0.0.0', port=8523)
```

## Notes

- Mast servo is servo 0 on the PCA9685
- Negative degrees = left, positive = right
- Stage 1 script needs to call `rover.cleanup()` after moving so rover_server can re-init cleanly
- May want a short `time.sleep(0.5)` between stage 2 and continuing init so the position is visible
