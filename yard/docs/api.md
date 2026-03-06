# API Reference

## Rover Server (marspi.local:8523)

### POST /queue/add

Add instruction(s) to the queue.

**Request:**
```bash
curl -X POST http://marspi.local:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 1}}]'
```

**Request Body:**
```json
[
  {
    "cmd": "forward",
    "params": {"speed": 60, "seconds": 1}
  }
]
```

**Response:**
```json
{
  "status": "ok",
  "added": 1,
  "instructions": [
    {
      "id": "uuid-here",
      "cmd": "forward",
      "params": {"speed": 60, "seconds": 1},
      "timestamp": "2024-01-15T12:00:00Z",
      "status": "pending"
    }
  ]
}
```

### POST /queue/clear

Clear queue and emergency stop.

**Request:**
```bash
curl -X POST http://marspi.local:8523/queue/clear
```

**Response:**
```json
{
  "status": "ok",
  "cleared": 3,
  "message": "Queue cleared and rover stopped"
}
```

### GET /queue/status

Get current queue status.

**Request:**
```bash
curl http://marspi.local:8523/queue/status
```

**Response:**
```json
{
  "current": {
    "id": "uuid",
    "cmd": "forward",
    "params": {"speed": 60, "seconds": 1},
    "status": "executing",
    "timestamp": "2024-01-15T12:00:00Z"
  },
  "pending": [...],
  "pending_count": 5,
  "history": [...],
  "history_count": 10
}
```

### GET /health

Health check endpoint.

**Request:**
```bash
curl http://marspi.local:8523/health
```

**Response:**
```json
{
  "status": "ok",
  "driver": "MockRoverDriver",
  "queue_size": 0
}
```

## Satellite Server (mro.local:5050)

The satellite proxies all `/api/*` calls to the rover.

| Satellite Endpoint | Proxies To |
|-------------------|------------|
| `POST /api/queue/add` | `POST http://marspi.local:8523/queue/add` |
| `POST /api/queue/clear` | `POST http://marspi.local:8523/queue/clear` |
| `GET /api/queue/status` | `GET http://marspi.local:8523/queue/status` |

### GET /api/health

Health check with rover connectivity status.

**Response:**
```json
{
  "status": "ok",
  "rover_url": "http://marspi.local:8523",
  "rover_status": "connected"
}
```

Possible `rover_status` values: `connected`, `disconnected`, `timeout`, `error`

### Web Routes

| Route | Description |
|-------|-------------|
| `GET /` | Links to code and monitor |
| `GET /code/` | Tablet Blockly interface |
| `GET /monitor/` | TV display interface |

## Camera Server (mro.local:8890)

WebSocket server streaming JPEG frames.

### Connect

```javascript
const ws = new WebSocket('ws://mro.local:8890');
```

### Messages

**Frame message:**
```json
{
  "type": "frame",
  "data": "<base64-encoded-jpeg>"
}
```

## Instruction Format

### Commands

| Command | Parameters | Description |
|---------|------------|-------------|
| `forward` | `speed`, `seconds` | Move forward |
| `backward` | `speed`, `seconds` | Move backward |
| `spin_left` | `speed`, `seconds` | Spin left in place |
| `spin_right` | `speed`, `seconds` | Spin right in place |
| `steer_left` | `degrees`, `speed`, `seconds` | Steer left while moving |
| `steer_right` | `degrees`, `speed`, `seconds` | Steer right while moving |
| `stop` | (none) | Stop immediately |
| `wait` | `seconds` | Wait without moving |

### Parameter Defaults

| Parameter | Default | Range |
|-----------|---------|-------|
| `speed` | 60 | 0-100 |
| `seconds` | 1.0 | 0.1-10 |
| `degrees` | 20 | 5-45 |

### Instruction Status

| Status | Description |
|--------|-------------|
| `pending` | Queued, waiting to execute |
| `executing` | Currently running |
| `completed` | Finished successfully |
| `error` | Failed with error |

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Description of the error"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request (invalid JSON, empty data) |
| 503 | Cannot connect to rover server |
| 504 | Rover server timeout |
| 500 | Internal server error |
