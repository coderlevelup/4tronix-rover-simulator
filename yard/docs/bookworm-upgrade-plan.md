# Bookworm/Trixie Upgrade Plan

This document outlines the changes required to support Raspberry Pi OS Bookworm (and later Trixie) instead of Bullseye Legacy.

## Current State

The rover currently requires **Raspberry Pi OS Legacy 32-bit (Bullseye)** because:

1. **rpi_ws281x** - LED control library uses PWM/DMA that changed in newer OS versions
2. **4tronix rover.py** - Bundles LED code with motor/servo code, tested only on Bullseye

## Blocking Issues

### 1. rpi_ws281x Incompatibility

| Pi Model | Bookworm Status |
|----------|-----------------|
| Pi 3/4   | May work with workarounds |
| Pi 5     | **Not supported** - RP1 chip is fundamentally different |

Error on Pi 5: `RuntimeError: ws2811_init failed with code -3 (Hardware revision is not supported)`

### 2. PEP 668 (Externally Managed Environments)

Bookworm enforces virtual environments for pip installs. System-wide `sudo pip install` no longer works without `--break-system-packages`.

## Upgrade Path

### Phase 1: LED Control Migration

**Goal:** Replace rpi_ws281x with SPI-based neopixel control

#### Hardware Change
- Rewire LED data line from PWM pin to **GPIO 10 (SPI MOSI)**
- Requires physical access to rover PCB/wiring

#### Software Change

Install Adafruit CircuitPython NeoPixel SPI:
```bash
python -m venv ~/rover-env
source ~/rover-env/bin/activate
pip install adafruit-circuitpython-neopixel-spi
```

Create new LED driver module `led_driver.py`:
```python
import board
import neopixel_spi as neopixel

class SPILedDriver:
    def __init__(self, num_pixels=4):
        self.pixels = neopixel.NeoPixel_SPI(
            board.SPI(),
            num_pixels,
            pixel_order=neopixel.GRB,
            auto_write=False
        )

    def set_pixel(self, index, r, g, b):
        self.pixels[index] = (r, g, b)

    def show(self):
        self.pixels.show()

    def fill(self, r, g, b):
        self.pixels.fill((r, g, b))
        self.pixels.show()
```

Update `drivers.py` to use new LED driver instead of rover.py LED functions.

### Phase 2: Decouple from 4tronix rover.py

**Goal:** Direct I2C control of motors/servos without depending on rover.py

#### Motor/Servo Control

The 4tronix board uses I2C (smbus2) to control servos via a PCA9685-style PWM chip. This should work on Bookworm.

Extract motor/servo functions into standalone module:
```python
import smbus2

class I2CMotorDriver:
    def __init__(self, address=0x40):
        self.bus = smbus2.SMBus(1)
        self.address = address
        # Initialize PCA9685...

    def set_servo(self, channel, angle):
        # Set servo position via I2C
        pass

    def set_motor(self, speed, direction):
        # Set motor speed/direction via I2C
        pass
```

### Phase 3: Virtual Environment Setup

**Goal:** Package everything to work with Bookworm's PEP 668 requirements

#### Updated Installation Script

Create `setup.sh`:
```bash
#!/bin/bash
cd ~/yard

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install flask smbus2 adafruit-circuitpython-neopixel-spi

# Add user to required groups
sudo usermod -aG gpio,spi,i2c $USER
```

#### Systemd Service Update

Update service files to use venv:
```ini
[Unit]
Description=Rover Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/yard/rover
ExecStart=/home/pi/yard/venv/bin/python rover_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

### Phase 4: Testing

#### Test Matrix

| Component | Pi 3 Bullseye | Pi 4 Bookworm | Pi 5 Bookworm |
|-----------|---------------|---------------|---------------|
| Motor forward/reverse | | | |
| Servo steering | | | |
| LED patterns | | | |
| Spin animations | | | |
| Queue processing | | | |
| Emergency stop | | | |

#### Test Procedure

1. Flash fresh Bookworm image
2. Run setup.sh
3. Enable SPI and I2C via raspi-config
4. Run test suite: `python -m pytest -v`
5. Manual test each motor/servo/LED function

## Alternative Approaches

### Option A: SPI LEDs (Recommended)
- Pros: Works on all Pi models including Pi 5
- Cons: Requires rewiring LED data line

### Option B: PIO Driver (Pi 5 only)
- New PIO-based WS2812 driver available for Pi 5
- See: https://www.raspberrypi.com/news/piolib/
- Cons: Pi 5 only, doesn't help Pi 3/4 on Bookworm

### Option C: Disable LEDs
- Simply remove LED functionality
- Pros: No hardware changes needed
- Cons: Loses visual feedback features

## Dependencies Summary

| Package | Purpose | Bullseye | Bookworm |
|---------|---------|----------|----------|
| flask | Web server | pip | venv + pip |
| smbus2 | I2C motor/servo | pip | venv + pip |
| rpi_ws281x | LEDs (PWM) | pip | **Remove** |
| adafruit-circuitpython-neopixel-spi | LEDs (SPI) | N/A | venv + pip |
| pytest | Testing | pip | venv + pip |

## Timeline

1. **Phase 1** - LED migration: Create SPILedDriver, test on bench
2. **Phase 2** - Motor decoupling: Extract I2C motor code from rover.py
3. **Phase 3** - Packaging: Create setup script, systemd services
4. **Phase 4** - Testing: Full test on Bookworm across Pi models

## References

- [Adafruit NeoPixels on Raspberry Pi](https://learn.adafruit.com/neopixels-on-raspberry-pi/python-usage)
- [Pi5Neo GitHub](https://github.com/vanshksingh/Pi5Neo)
- [rpi_ws281x Pi 5 Issue](https://github.com/jgarff/rpi_ws281x/issues/528)
- [Gordon Lesti - WS2811 via SPI](https://gordonlesti.com/light-up-ws2811-leds-with-a-raspberry-pi-5-via-spi/)
- [PEP 668 - Externally Managed Environments](https://peps.python.org/pep-0668/)
