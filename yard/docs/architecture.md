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
│  │  @app.route('/queue/events')  ← SSE stream           │   │
│  │       → service.subscribe() / get_status()           │   │
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
│  │    - SSE subscriber fan-out (_subscribers list)      │   │
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
1. User creates program on tablet (Blockly or Python tab)
                    │
                    ▼
2. Click "Run"
   Blockly tab → generatePythonCode() + serialise workspace
                  → params: { code, blockly_state }
   Python tab  → read Monaco editor value
                  → params: { code }
                    │
                    ▼
3. POST /api/queue/add [{cmd: 'run_python', params}] (to satellite)
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
   - Executes Python code (rover + time available)
   - Sets status to 'completed'
   - Moves to history
                    │
                    ▼
7. TV monitor receives queue updates via SSE push
   - EventSource('/api/queue/events') holds one persistent connection
   - Rover pushes a state snapshot whenever something changes
   - Only re-renders when data changes (no flicker)
   - Blockly-sourced instructions → read-only Blockly workspace preview
   - Python-sourced instructions → code block
   - Shows current / pending / history
   - ↻ refresh button triggers a one-off GET /api/queue/status fetch
```

### SSE Push Architecture

The monitor receives queue state via Server-Sent Events rather than polling. Each layer holds one persistent HTTP connection to the layer below it — nothing polls.

```
Browser                  Satellite (Flask :5050)       Rover (Flask :8523)
   │                              │                              │
   │  GET /api/queue/events       │                              │
   │─────────────────────────────▶│                              │
   │                              │  GET /queue/events           │
   │                              │─────────────────────────────▶│
   │                              │                              │ subscribe()
   │                              │                              │ → Queue() added
   │◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│◀ ─  200 streaming  ─ ─ ─ ─ ─│
   │   (both responses stay open) │                              │
```

**Rover subscriber fan-out** — `service.subscribe()` creates a `queue.Queue` and adds it to `_subscribers`. The SSE generator blocks on `q.get(timeout=30)`. When state changes, `_notify_subscribers()` serialises `get_status()` and calls `q.put_nowait()` on every subscriber, unblocking each waiting generator.

`_notify_subscribers()` is called at four points in the service:
- `add_instructions()` — after appending to the queue
- `clear_queue()` — after clearing
- `_execute_instruction()` — after setting status to `'executing'`
- `_execute_instruction()` — after setting status to `'completed'` or `'error'`

**Satellite proxy** — uses `requests.get(..., stream=True, timeout=None)` and `iter_content(chunk_size=None)`. It is a byte pipe: it does not parse or buffer SSE events, just forwards raw bytes as they arrive.

**Heartbeat** — the rover generator catches `queue.Empty` after 30s and yields `: heartbeat\n\n`. This keeps proxies and load balancers from closing an idle connection. Browsers ignore SSE comment lines.

**Reconnection** — `EventSource` handles reconnection automatically. `onerror` fires on disconnect (badge goes grey); `onopen` fires when the connection is re-established (badge goes green). No manual reconnect logic is needed in the browser.

**On rover offline** — the satellite's `requests.get` raises `ConnectionError`, which returns HTTP 503. The browser's `EventSource` retries every 3s until the rover comes back.

**Cleanup** — when a browser tab closes, the satellite generator receives `GeneratorExit` in its `finally:` block and calls `rover_resp.close()`. The rover detects the broken pipe and `service.unsubscribe(q)` removes the queue from `_subscribers`.

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
