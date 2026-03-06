# Yard - Rover Simulator

Queue-based instruction processor for the 4tronix Mars Rover.

## Quick Start

```bash
cd yard/rover
pip install -r requirements.txt
python rover_server.py
```

Auto-detects Pi vs dev machine:
- **On Pi**: Controls real hardware
- **Not on Pi**: Mock mode, logs commands

## Test It

```bash
# Add instructions
curl -X POST http://localhost:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 1}}]'

# Check status
curl http://localhost:8523/queue/status

# Emergency stop
curl -X POST http://localhost:8523/queue/clear
```

## Run Tests

```bash
cd yard/rover
python -m pytest -v
# → 52 tests pass (26 unit + 26 integration)
```

## Instructions

| Command | Parameters | Description |
|---------|------------|-------------|
| `forward` | `speed`, `seconds` | Move forward |
| `backward` | `speed`, `seconds` | Move backward |
| `spin_left` | `speed`, `seconds` | Spin left in place |
| `spin_right` | `speed`, `seconds` | Spin right in place |
| `steer_left` | `degrees`, `speed`, `seconds` | Steer while moving |
| `steer_right` | `degrees`, `speed`, `seconds` | Steer while moving |
| `stop` | - | Stop immediately |
| `wait` | `seconds` | Pause |

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/architecture.md) | Ports & Adapters pattern, data flow |
| [API Reference](docs/api.md) | REST endpoints, instruction format |
| [Testing](docs/testing.md) | Unit & integration tests |
| [Satellite](docs/satellite.md) | Web interfaces, camera server |
