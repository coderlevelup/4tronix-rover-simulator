# Architecture

## System Overview

The Yard system consists of three devices working together:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     Tablet       │     │    Satellite     │     │      Rover       │
│   (Browser)      │────▶│   (mro.local)    │────▶│  (marspi.local)  │
│                  │     │                  │     │                  │
│  Blockly IDE     │     │  :5050 Web       │     │  :8523 Queue     │
│  /code/          │     │  :8890 Camera    │     │  Processor       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                        │                        │
        │                        │                        ▼
        │                        │                 ┌──────────────────┐
        │                        │                 │   4tronix Mars   │
        │                        ▼                 │   Rover Hardware │
        │                 ┌──────────────────┐     └──────────────────┘
        │                 │   Pi AI Camera   │
        │                 │   (IMX500)       │
        └────────────────▶└──────────────────┘
              TV Monitor
              /monitor/
```

| Device | Hostname | Services |
|--------|----------|----------|
| **Rover** | marspi.local:8523 | Queue-based instruction processor |
| **Satellite** | mro.local:5050 | Web interfaces (`/code/`, `/monitor/`) |
| **Camera** | mro.local:8890 | Pi AI camera WebSocket stream |

## Rover Server Architecture (Ports & Adapters)

The rover server follows the Ports & Adapters (Hexagonal) pattern for testability:

```
┌─────────────────────────────────────────────────────────────┐
│  rover_server.py - Primary Adapter (Flask HTTP layer)       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  @app.route('/queue/add')                            │   │
│  │       → service.add_instructions(data)               │   │
│  │  @app.route('/queue/clear')                          │   │
│  │       → service.clear_queue()                        │   │
│  │  @app.route('/queue/status')                         │   │
│  │       → service.get_status()                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  service.py - Application Service (business logic)          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RoverQueuePort (abstract interface)                 │   │
│  │    - add_instructions()                              │   │
│  │    - clear_queue()                                   │   │
│  │    - get_status()                                    │   │
│  │    - get_health()                                    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  RoverQueueService (implementation)                  │   │
│  │    - Thread-safe queue management                    │   │
│  │    - Background processor thread                     │   │
│  │    - Instruction execution                           │   │
│  │    - Interruptible waits for emergency stop          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  drivers.py - Secondary Adapter (hardware abstraction)      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RoverDriver (abstract interface)                    │   │
│  │    - forward(), reverse(), spin_left(), spin_right() │   │
│  │    - steer_left(), steer_right(), stop()             │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  RealRoverDriver    │  MockRoverDriver               │   │
│  │  (Pi hardware)      │  (logging for dev/test)        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Benefits

- **Unit tests** call `RoverQueueService` directly (no HTTP overhead)
- **Integration tests** use Flask test client (full stack)
- **Mock driver** enables testing without hardware
- **Dependency injection** for time/uuid providers in tests

## Directory Structure

```
yard/
├── rover/
│   ├── rover_server.py      # Flask HTTP adapter (thin layer)
│   ├── service.py           # RoverQueueService (business logic)
│   ├── drivers.py           # RoverDriver interface + Real/Mock implementations
│   ├── test_service.py      # Unit tests (26 tests)
│   ├── test_integration.py  # Integration tests (26 tests)
│   └── requirements.txt
├── satellite/
│   ├── web_server.py        # Flask server for mro.local (port 5050)
│   ├── camera_server.py     # Pi AI camera WebSocket stream (port 8890)
│   ├── templates/
│   │   ├── code.html        # Tablet Blockly PWA
│   │   └── monitor.html     # TV display (no interaction)
│   ├── static/
│   │   ├── manifest.json    # PWA manifest
│   │   └── service-worker.js
│   └── requirements.txt
├── docs/
│   ├── architecture.md      # This file
│   ├── api.md               # API reference
│   └── testing.md           # Testing guide
└── README.md
```

## Data Flow

### Instruction Lifecycle

```
1. User creates Blockly program on tablet
                    │
                    ▼
2. Click "Run" → parseWorkspace() generates instructions
                    │
                    ▼
3. POST /api/queue/add (to satellite)
                    │
                    ▼
4. Satellite proxies to rover POST /queue/add
                    │
                    ▼
5. RoverQueueService.add_instructions()
   - Assigns UUID and timestamp
   - Adds to thread-safe queue
                    │
                    ▼
6. Background processor thread picks up instruction
   - Sets status to 'executing'
   - Calls driver methods (forward, spin, etc.)
   - Waits for duration (interruptible)
   - Calls driver.stop()
   - Sets status to 'completed'
   - Moves to history
                    │
                    ▼
7. TV monitor polls /api/queue/status
   - Shows current instruction executing
   - Shows pending queue
   - Shows completion history
```

### Emergency Stop

```
1. User clicks "Stop" button
                    │
                    ▼
2. POST /api/queue/clear (to satellite)
                    │
                    ▼
3. Satellite proxies to rover POST /queue/clear
                    │
                    ▼
4. RoverQueueService.clear_queue()
   - Sets stop_requested flag
   - Calls driver.stop() immediately
   - Clears pending queue
   - Interruptible wait returns early
   - Clears stop flag
```

## Tablet Client Architecture

The Blockly interface also uses Ports & Adapters:

```javascript
// Port (interface)
class RoverService {
    async addToQueue(instructions) { }
    async clearQueue() { }
    async getStatus() { }
}

// Real adapter - calls actual API
class RealRoverService extends RoverService { ... }

// Mock adapter - logs to UI for testing
class MockRoverService extends RoverService { ... }

// Injection via URL parameter
const service = new URL(location).searchParams.get('mock')
    ? new MockRoverService(outputElement)
    : new RealRoverService('/api');
```

Test mode: `/code/?mock=true` - works offline, shows what would be sent.
