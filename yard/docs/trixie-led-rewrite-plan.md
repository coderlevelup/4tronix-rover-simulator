# LED Rewrite for Trixie Support

## Overview

Create an LED abstraction layer that supports both:
- **rpi_ws281x** (current, GPIO 18/PWM) - Bullseye/Bookworm
- **neopixel_spi** (new, GPIO 10/SPI) - Trixie

**Hardware constraint:** Cannot rewire LEDs from GPIO 18 to GPIO 10. This plan supports *new builds* that wire for SPI from the start, while maintaining backward compatibility.

## Files to Create

### 1. `real-rover/led_driver.py` - LED Driver Abstraction

```python
from abc import ABC, abstractmethod

class LEDDriver(ABC):
    NUM_PIXELS = 4

    @abstractmethod
    def init(self, brightness: int = 40) -> None: pass

    @abstractmethod
    def cleanup(self) -> None: pass

    @abstractmethod
    def set_pixel(self, index: int, r: int, g: int, b: int) -> None: pass

    @abstractmethod
    def show(self) -> None: pass

    # Legacy compatibility
    def setPixel(self, index: int, color: int) -> None:
        r = (color >> 16) & 0xFF
        g = (color >> 8) & 0xFF
        b = color & 0xFF
        self.set_pixel(index, r, g, b)

class WS281xLEDDriver(LEDDriver):
    """GPIO 18/PWM - works on Bullseye/Bookworm"""
    # Uses rpi_ws281x.Adafruit_NeoPixel

class SPILEDDriver(LEDDriver):
    """GPIO 10/SPI - works on Trixie"""
    # Uses neopixel_spi.NeoPixel_SPI

class NullLEDDriver(LEDDriver):
    """No-op for testing or disabled LEDs"""
```

### 2. `real-rover/led_factory.py` - Auto-Detection

```python
def create_led_driver() -> LEDDriver:
    # Priority:
    # 1. ROVER_LED_DRIVER env var (spi/ws281x/null)
    # 2. Auto-detect OS (Trixie -> try SPI first)
    # 3. Fallback to available library
```

## Files to Modify

### 3. `real-rover/rover.py` - Minimal Changes

**Current (line 139):**
```python
leds = Adafruit_NeoPixel(numPixels, 18, 800000, 5, False, _brightness)
leds.begin()
```

**New:**
```python
from led_factory import create_led_driver
_led_driver = create_led_driver()
_led_driver.init(_brightness)
```

**Update LED functions (lines 480-515) to delegate:**
```python
def setPixel(ID, color):
    if ID <= numPixels:
        _led_driver.setPixel(ID, color)

def show():
    _led_driver.show()
```

## Configuration

| Method | Example |
|--------|---------|
| Environment var | `ROVER_LED_DRIVER=spi` |
| Auto-detect | Checks `/etc/os-release` for Trixie |
| Hardware check | Verifies `/dev/spidev0.0` exists |

## Dependencies

| OS | LED Driver | Install |
|----|------------|---------|
| Bullseye/Bookworm | ws281x | `pip install rpi-ws281x` |
| Trixie (SPI wired) | neopixel_spi | `pip install adafruit-circuitpython-neopixel-spi` |

## Hardware Requirements for SPI

New builds targeting Trixie must:
1. Wire NeoPixel data to **GPIO 10** (SPI MOSI) instead of GPIO 18
2. Enable SPI: `sudo raspi-config` → Interface Options → SPI

## Migration Path

| Phase | Change | Risk |
|-------|--------|------|
| 1 | Add led_driver.py, led_factory.py | None - new files |
| 2 | Update rover.py init() | Low - same behavior |
| 3 | Update rover.py LED functions | Low - delegates to driver |
| 4 | Test on each OS | Medium |

## Verification

1. **Unit tests:** Mock LED driver, verify calls
2. **Bullseye test:** Run with `ROVER_LED_DRIVER=ws281x`, verify LEDs work
3. **Bookworm test:** Same as Bullseye
4. **Trixie test (if SPI wired):** Run with `ROVER_LED_DRIVER=spi`
5. **Null driver test:** `ROVER_LED_DRIVER=null` - no crashes, no LED output

## Limitations

- **Existing hardware:** Cannot use SPI driver without rewiring
- **Pi Zero + Trixie + GPIO 18:** May not work - Trixie breaks rpi_ws281x
- **Recommendation:** For Pi Zero, stay on Bookworm unless rewiring for SPI
