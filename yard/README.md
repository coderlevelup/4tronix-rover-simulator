# Yard - Rover Control System

A queue-based system for controlling the 4tronix Mars Rover from a tablet with live TV monitoring.

## Quick Start

### 1. On Rover (marspi.local)

```bash
cd yard/rover
pip install -r requirements.txt
python rover_server.py
```

### 2. On Satellite (mro.local)

```bash
# Terminal 1: Camera
cd yard/satellite
pip install -r requirements.txt
python camera_server.py

# Terminal 2: Web server
cd yard/satellite
python web_server.py
```

### 3. Open Interfaces

- **Tablet**: http://mro.local:5050/code/
- **TV Monitor**: http://mro.local:5050/monitor/

## Local Development (No Hardware)

The system auto-detects when not running on a Pi and uses mock drivers:

```bash
# Create venv
cd yard
python -m venv venv
source venv/bin/activate
pip install flask requests pytest

# Run rover server (mock mode)
cd rover
python rover_server.py
# → "Using MockRoverDriver (not on Pi)"

# Run tests
python -m pytest -v
# → 52 tests pass
```

Test the tablet interface in mock mode:
```
http://localhost:5050/code/?mock=true
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, Ports & Adapters pattern, data flow |
| [API Reference](docs/api.md) | REST endpoints, WebSocket protocol, instruction format |
| [Testing Guide](docs/testing.md) | Running tests, writing tests, mock drivers |

## Project Structure

```
yard/
├── rover/           # Runs on marspi.local:8523
│   ├── rover_server.py
│   ├── service.py
│   ├── drivers.py
│   └── test_*.py
├── satellite/       # Runs on mro.local:5050 + :8890
│   ├── web_server.py
│   ├── camera_server.py
│   └── templates/
├── docs/
└── README.md
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ROVER_URL` | `http://marspi.local:8523` | Rover server URL (for satellite) |

```bash
ROVER_URL=http://localhost:8523 python web_server.py
```
