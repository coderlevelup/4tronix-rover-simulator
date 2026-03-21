# Bookworm/Trixie Upgrade Plan

This document outlines the changes required to support Raspberry Pi OS Bookworm (and later Trixie) instead of Bullseye Legacy.

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

## Upgrade Path (Pi Zero)

Since Pi Zero uses BCM2835, rpi_ws281x should work without hardware changes.

### Phase 1: Virtual Environment Setup

**Goal:** Package everything to work with Bookworm's PEP 668 requirements

#### Setup Script

Create `setup-bookworm.sh`:
```bash
#!/bin/bash
set -e

cd /home/pi

# Create virtual environment
python3 -m venv rover-env
source rover-env/bin/activate

# Install rover dependencies
pip install rpi_ws281x smbus2

# Install yard server dependencies
pip install flask pytest

# Add user to required groups
sudo usermod -aG gpio,spi,i2c pi

echo "Setup complete. Reboot for group changes to take effect."
```

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

**Goal:** Run rover server on boot using venv

Create `/etc/systemd/system/rover-server.service`:
```ini
[Unit]
Description=Rover Queue Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/yard/rover
Environment=PATH=/home/pi/rover-env/bin
ExecStart=/home/pi/rover-env/bin/python rover_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable with:
```bash
sudo systemctl enable rover-server
sudo systemctl start rover-server
```

### Phase 4: Testing

#### Test Matrix

| Component | Pi Zero Bullseye | Pi Zero Bookworm |
|-----------|------------------|------------------|
| Motor forward/reverse | ✓ (current) | To test |
| Servo steering | ✓ (current) | To test |
| LED patterns | ✓ (current) | To test |
| Spin animations | ✓ (current) | To test |
| Queue processing | ✓ (current) | To test |
| Emergency stop | ✓ (current) | To test |

#### Test Procedure

1. Flash fresh Bookworm 32-bit image (Pi Zero needs 32-bit)
2. Enable SPI and I2C via raspi-config
3. Run setup-bookworm.sh
4. Patch rover.py for smbus2
5. Reboot
6. Run yard server: `source ~/rover-env/bin/activate && cd yard/rover && python rover_server.py`
7. Test each function via curl commands
8. Run test suite: `python -m pytest -v`

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
- [Pi5Neo GitHub](https://github.com/vanshksingh/Pi5Neo)
- [rpi_ws281x Pi 5 Issue](https://github.com/jgarff/rpi_ws281x/issues/528)
- [Gordon Lesti - WS2811 via SPI](https://gordonlesti.com/light-up-ws2811-leds-with-a-raspberry-pi-5-via-spi/)
- [PEP 668 - Externally Managed Environments](https://peps.python.org/pep-0668/)
