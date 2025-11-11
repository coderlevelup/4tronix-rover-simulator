# Real Rover Server

This directory contains the server to control the actual 4tronix M.A.R.S. Rover hardware.

## Files

- **rover.py**: Official 4tronix rover control library (from http://4tronix.co.uk/rover/rover.py)
- **rover_server.py**: HTTP server that exposes the same API as the simulator UI

## Usage

### On the Raspberry Pi (connected to the rover):

1. Install dependencies:
```bash
pip install flask RPi.GPIO rpi_ws281x smbus
```

2. Run the server:
```bash
sudo python3 rover_server.py
```

The server will start on port 8523 and accept HTTP POST requests.

### From your development machine:

Run your rover control programs (the same ones you use with the simulator):

```bash
python3 square.py
python3 move-rover.py
```

Just make sure `roversimulator.py` points to your Raspberry Pi's IP address instead of `127.0.0.1`:

```python
simulatorUiUrl = "http://<raspberry-pi-ip>:8523/"
```

## API

The server accepts the same JSON format as `roversimui.py`:

```json
{
  "wheelMotors": {
    "l": [fwd_speed, rev_speed],
    "r": [fwd_speed, rev_speed]
  },
  "servos": {
    "9": -10,
    "15": 10
  },
  "rgbLeds": {
    "0": [255, 0, 0],
    "1": [0, 255, 0]
  }
}
```

Response:
```json
{
  "ultrasonicRange": 80.5
}
```

## Notes

- The server must be run with `sudo` because it requires GPIO access
- Make sure the rover hardware is properly connected before starting the server
- The server will automatically initialize the rover with brightness 40
