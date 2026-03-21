# Rover Server

The rover server is a queue-based REST API that processes instructions for the rover. It can run in mock mode (for development) or connect to real hardware on a Raspberry Pi.

## Hardware Assembly

If you're setting up a new M.A.R.S. Rover from scratch:

- [Assembly Instructions](https://4tronix.co.uk/blog/?p=2112) - Step-by-step build guide
- [Assembly Video](https://www.youtube.com/watch?v=Np8ZQQd85oc) - Video walkthrough

## Pi Setup (New SD Card)

Follow the [4tronix Pi Setup Guide](https://4tronix.co.uk/blog/?p=2409) for full details. Key steps:

### 1. Image the SD Card

Use **Raspberry Pi OS (Legacy, 32-bit)** - the Bullseye version. Flash it using Raspberry Pi Imager.

### 2. Enable Interfaces

After first boot, run:
```bash
sudo raspi-config
```
Navigate to **Interfaces** and enable both **SPI** and **I2C**. Reboot.

### 3. Install Rover Software

```bash
sudo pip install rpi_ws281x
wget https://4tronix.co.uk/rover.sh -O rover.sh
bash rover.sh
```

This creates `/home/pi/marsrover` with the rover library and test programs.

### 4. Calibrate Servos

Before first use, calibrate the wheel servos:
```bash
cd ~/marsrover
sudo python calibrateServos.py
```

This ensures all wheels point straight when centered.

> **Note:** Motor and servo test programs must run in a terminal (like LXTerminal), not in an IDE.

## First Time Setup (Yard Server)

Before you can run the server, you'll need to set up a Python environment and install some libraries. Don't worry - you only need to do this once on each computer.

1. Open a terminal window and navigate to the yard folder:

```bash
cd yard
```

2. Create a Python virtual environment. This is a special folder that keeps all the libraries this project needs separate from other Python projects:

```bash
python -m venv venv
```

3. Activate the environment. This tells your terminal to use the libraries in this virtual environment:

```bash
source venv/bin/activate
```

You should see `(venv)` appear at the start of your terminal prompt. This means the environment is active.

4. Install the required libraries:

```bash
pip install -r rover/requirements.txt
```

You might see some warnings - that's usually fine. As long as it doesn't show any errors in red, you're good to go.

## Running the Server

Once you've done the setup, you can run the server like this:

1. Make sure you're in the yard folder and your virtual environment is activated (you should see `(venv)` in your prompt)

2. Start the rover server:

```bash
cd rover
python rover_server.py
```

You should see a message like:
```
Using MockRoverDriver (not on Pi)
Queue processor started
Starting rover server on port 8523...
```

The "MockRoverDriver" message means it's running in simulator mode - perfect for development!

## Sending Commands

With the server running, you can send commands to the rover. Open a new terminal window and try this:

```bash
curl -X POST http://localhost:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 2}}]'
```

This tells the rover to move forward at speed 60 for 2 seconds. Back in your server window, you should see:
```
[MOCK] Forward at speed 60
[MOCK] Stop
```

You can also check what the rover is doing:
```bash
curl http://localhost:8523/queue/status
```

And if you ever need to stop the rover immediately:
```bash
curl -X POST http://localhost:8523/queue/clear
```

## Available Commands

Here are all the commands you can send to the rover:

| Command | What it does | Parameters |
|---------|--------------|------------|
| `forward` | Move forward | `speed` (0-100), `seconds` |
| `backward` | Move backward | `speed` (0-100), `seconds` |
| `spin_left` | Spin left on the spot | `speed` (0-100), `seconds` |
| `spin_right` | Spin right on the spot | `speed` (0-100), `seconds` |
| `steer_left` | Steer left while moving | `degrees` (5-45), `speed`, `seconds` |
| `steer_right` | Steer right while moving | `degrees` (5-45), `speed`, `seconds` |
| `stop` | Stop immediately | (none) |
| `wait` | Pause without moving | `seconds` |

## Running the Tests

If you want to make sure everything is working correctly, you can run the test suite:

```bash
cd rover
python -m pytest -v
```

This runs 52 tests that check all the different parts of the server. If you see all green checkmarks, everything is working!

## On a Raspberry Pi

When running on a Raspberry Pi with the real rover hardware connected, the server automatically detects this and uses the real hardware driver instead of the mock. You'll see:

```
Using RealRoverDriver (Pi detected)
```

The same commands work exactly the same way - the rover will actually move!
