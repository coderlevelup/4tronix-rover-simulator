# Yard - Rover Simulator

This is a queue-based simulator for the 4tronix M.A.R.S. Rover. It lets you develop and test rover programs without needing the actual rover hardware connected.

The simulator automatically detects whether it's running on a Raspberry Pi with real rover hardware, or on a regular computer. When there's no rover connected, it runs in "mock mode" and just logs what the rover *would* do.

## Getting Started

### First Time Setup

Before you can run the simulator, you'll need to set up a Python environment and install some libraries. Don't worry - you only need to do this once on each computer.

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

### Running the Simulator

Once you've done the setup, you can run the simulator like this:

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

### Sending Commands to the Rover

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

This runs 52 tests that check all the different parts of the simulator. If you see all green checkmarks, everything is working!

## More Documentation

If you want to dig deeper into how things work:

- [Architecture](docs/architecture.md) - How the different parts of the system fit together
- [API Reference](docs/api.md) - Complete details on all the REST endpoints
- [Testing Guide](docs/testing.md) - How to write and run tests
- [Satellite Server](docs/satellite.md) - The web interface and camera server (for tablets and TVs)
