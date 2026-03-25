# Bookworm Upgrade Plan

This document outlines the changes required to support Raspberry Pi OS Bookworm instead of Bullseye Legacy.

> **Why not Trixie?** Trixie (Debian 13, released Oct 2025) has breaking changes that affect rpi_ws281x:
> - Sysfs GPIO (`/sys/class/gpio`) deprecated/removed in favor of `/dev/gpiochipN`
> - PWM kernel changes in Linux 6.12 (`pwmchip2` missing)
> - Would require rewriting LED code to use SPI or lgpio
>
> Bookworm is the safer upgrade path for Pi Zero.

## Target Hardware

**Raspberry Pi Zero W** - Uses BCM2835 chip (same as Pi 1/2).

## Current State

The rover currently requires **Raspberry Pi OS Legacy 32-bit (Bullseye)** because:

1. **rpi_ws281x** - LED control library tested only on Bullseye
2. **4tronix rover.py** - Bundles LED code with motor/servo code, tested only on Bullseye

## Compatibility Assessment

### rpi_ws281x on Pi Zero

| Pi Model | Bookworm Status |
|----------|-----------------|
| **Pi Zero/1/2** | **Should work** - BCM2835 chip unchanged |
| Pi 3/4   | Should work - BCM2836/2837 similar architecture |
| Pi 5     | Not supported - RP1 chip is fundamentally different |

The Pi Zero uses the same BCM2835 SoC as original Pi models. The PWM/DMA hardware that rpi_ws281x depends on is unchanged in Bookworm for this chip.

### PEP 668 (Externally Managed Environments)

Bookworm enforces virtual environments for pip installs. System-wide `sudo pip install` no longer works without `--break-system-packages`.

### sudo + venv Conflict

**Problem:** rpi_ws281x requires root/sudo for PWM hardware access, but `sudo python` doesn't see the venv packages.

**Solutions:**
- Manual run: `sudo -E env PATH=$PATH python3 script.py`
- Systemd: Runs as root by default, use absolute path to venv Python

### Audio/PWM Hardware Conflict

The PWM hardware used by rpi_ws281x conflicts with audio. Must disable audio:

```bash
# In /boot/config.txt, change:
dtparam=audio=on
# To:
dtparam=audio=off
```

### 32-bit Requirement

Pi Zero requires **32-bit** Bookworm (armhf). Do not use arm64 images.

## Upgrade Path (Pi Zero)

Since Pi Zero uses BCM2835, rpi_ws281x should work without hardware changes.

> **Status: Completed and verified working on curiosity (Pi Zero W, Bookworm Lite, March 2026)**

### Phase 1: Virtual Environment Setup

**Goal:** Package everything to work with Bookworm's PEP 668 requirements

```bash
cd /home/mars
python3 -m venv rover-env
source rover-env/bin/activate
pip install rpi_ws281x smbus2 RPi.GPIO flask
```

> Note: `RPi.GPIO` must be explicitly installed — it is not bundled with Bookworm Lite.

### Phase 2: Update 4tronix rover.py for smbus2

**Goal:** Patch rover.py to use smbus2 instead of smbus

The 4tronix rover.py module uses `import smbus`. On Bookworm, smbus2 is preferred.

#### Option A: Patch import (minimal change)
```bash
# In /home/pi/marsrover/rover.py, change:
import smbus
# To:
import smbus2 as smbus
```

#### Option B: Install smbus compatibility
```bash
pip install smbus-cffi  # Provides smbus module via smbus2
```

### Phase 3: Systemd Service Setup

**Goal:** Run rover server on boot using venv with root access for PWM

Systemd services run as root by default, which provides the PWM hardware access that rpi_ws281x needs. No `sudo` required in the service file.

Create `/etc/systemd/system/rover-server.service`:
```ini
[Unit]
Description=4tronix M.A.R.S. Rover Queue Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/mars/4tronix-rover-simulator/yard/rover
Environment=PYTHONPATH=/home/mars/marsrover
ExecStart=/home/mars/rover-env/bin/python rover_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Note: `PYTHONPATH` must point to `/home/mars/marsrover` so rover.py and pca9685.py are found.

Enable with:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rover-server
sudo systemctl start rover-server
```

### Phase 4: Testing

#### Test Matrix

| Component | Pi Zero Bullseye | Pi Zero Bookworm |
|-----------|------------------|------------------|
| Motor forward/reverse | ✓ | ✓ |
| Servo steering | ✓ | ✓ |
| LED patterns | ✓ | ✓ |
| Spin animations | ✓ | ✓ |
| Queue processing | ✓ | ✓ |
| Emergency stop | ✓ | ✓ |

#### Test Procedure

1. Flash Bookworm Lite 32-bit image using Raspberry Pi Imager with OS customisation
2. Enable SPI and I2C: `sudo raspi-config nonint do_spi 0 && sudo raspi-config nonint do_i2c 0`
3. Disable audio: edit `/boot/firmware/config.txt`, set `dtparam=audio=off`
4. Reboot
5. Install venv and dependencies (Phase 1)
6. Install 4tronix rover software: `wget https://4tronix.co.uk/rover.sh -O rover.sh && bash rover.sh`
7. Patch smbus imports in `marsrover/rover.py` and `marsrover/pca9685.py`
8. Clone repo: `git clone https://github.com/coderlevelup/4tronix-rover-simulator.git`
9. Create systemd service (Phase 3)
10. Test via curl:
9. If working, enable systemd service
10. Run test suite: `python -m pytest -v`

## Fallback Options

### If rpi_ws281x fails on Bookworm

1. **Disable LEDs only** - Comment out LED calls in drivers.py, keep motors working
2. **Stay on Bullseye** - Known working configuration

### If smbus2 patch fails

1. Try `pip install smbus-cffi` for smbus compatibility layer
2. Check 4tronix for updated rover.py

## Dependencies Summary

| Package | Purpose | Bullseye | Bookworm |
|---------|---------|----------|----------|
| flask | Web server | sudo pip | venv + pip |
| smbus/smbus2 | I2C motor/servo | sudo pip | venv + pip |
| rpi_ws281x | LEDs (PWM) | sudo pip | venv + pip |
| pytest | Testing | sudo pip | venv + pip |

## Steps Summary

1. **Phase 1** - Create venv, install dependencies
2. **Phase 2** - Patch rover.py smbus import
3. **Phase 3** - Create systemd service for auto-start
4. **Phase 4** - Test all rover functions

## References

- [Adafruit NeoPixels on Raspberry Pi](https://learn.adafruit.com/neopixels-on-raspberry-pi/python-usage)
- [Adafruit - Usage with sudo](https://learn.adafruit.com/python-virtual-environment-usage-on-raspberry-pi/usage-with-sudo)
- [Adafruit - Running at Boot](https://learn.adafruit.com/python-virtual-environment-usage-on-raspberry-pi/automatically-running-at-boot)
- [rpi_ws281x GitHub](https://github.com/jgarff/rpi_ws281x)
- [Pimoroni - Python Virtual Environments on Bookworm](https://pimoroni.github.io/venv-python/)
- [PEP 668 - Externally Managed Environments](https://peps.python.org/pep-0668/)

### Trixie Research (why we avoid it)
- [Raspberry Pi OS Trixie Announcement](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/)
- [GPIO changes in Trixie](https://neilzone.co.uk/2025/12/using-gpioset-and-gpioget-to-control-the-gpio-pins-on-a-raspberry-pi-with-a-relay-board-under-debian-trixie/)
- [PWM kernel issue #6818](https://github.com/raspberrypi/linux/issues/6818)
