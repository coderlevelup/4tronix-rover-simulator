# Yard

Yard is a queue-based control system designed for classroom use with the 4tronix M.A.R.S. Rover. It adds a tablet-friendly Blockly interface and a TV monitor display for group activities.

## What's in Yard?

```
yard/
├── rover/           # Queue-based instruction server (runs on the rover Pi)
│   ├── rover_server.py
│   ├── service.py
│   ├── drivers.py
│   └── test_*.py
├── satellite/       # Web interfaces (runs on a separate Pi)
│   ├── web_server.py
│   ├── camera_server.py
│   └── templates/
└── docs/
```

**Rover** (marspi.local:8523) - Receives instructions via REST API and executes them in order. Automatically uses mock mode when not on a Pi.

**Satellite** (mro.local:5050) - Serves the tablet Blockly interface at `/code/` and the TV monitor at `/monitor/`. Also streams the Pi camera at port 8890.

## How It Works

1. Kids build programs using Blockly blocks on a tablet
2. Pressing "Run" sends instructions to the rover's queue
3. The rover executes instructions one at a time
4. The TV monitor shows the camera feed and queue status
5. "Stop" button triggers emergency stop and clears the queue

## Documentation

| Doc | Description |
|-----|-------------|
| [Rover Server](docs/rover-server.md) | Setup and API for the queue server |
| [Satellite](docs/satellite.md) | Web interface and camera server |
| [Architecture](docs/architecture.md) | System design and data flow |
| [API Reference](docs/api.md) | REST endpoints and instruction format |
| [Testing](docs/testing.md) | Running and writing tests |
