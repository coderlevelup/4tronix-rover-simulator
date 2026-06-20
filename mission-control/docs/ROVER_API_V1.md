# Rover API v1 Documentation

**Version:** 1.0.0  
**Last Updated:** May 14, 2026  
**Status:** Active

## Overview

The Rover API v1 provides a unified interface for controlling both **physical Pi Zero rovers** and **cloud-based simulators**. This API uses a queue-based instruction model where commands are submitted via HTTP POST requests and executed asynchronously (physical rovers) or synchronously (simulators).

## Key Features

- **Unified Interface**: Same API for physical hardware and simulators
- **API Versioning**: `apiVersion: 'v1'` ensures compatibility across rover software versions
- **Queue-Based Execution**: Instructions are queued and processed in order
- **Mission Correlation**: Each instruction includes a mission ID for tracking
- **Security**: Code validation prevents execution of unsafe Python code

---

## Base URLs

| Environment | URL | Description |
|-------------|-----|-------------|
| Physical Rover (Local) | `http://marspi.local:8523` | Raspberry Pi Zero rover on local network |
| Simulator (Cloud) | `http://localhost:8080` | Cloud-based Python simulator |

---

## API Endpoints

### 1. Add Instruction to Queue

**Endpoint:** `POST /queue/add`

Adds one or more Python code execution instructions to the rover's queue.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:** Array of instruction objects

```typescript
[
  {
    apiVersion: "v1",
    cmd: "run_python",
    params: {
      code: string,  // Python code to execute
      id: string     // Mission ID for correlation
    }
  }
]
```

**Example:**
```json
[
  {
    "apiVersion": "v1",
    "cmd": "run_python",
    "params": {
      "code": "rover.forward(60)\ntime.sleep(2)\nrover.stop()",
      "id": "mission-abc123"
    }
  }
]
```

#### Response

**Success (200 OK):**
```json
{
  "apiVersion": "v1",
  "status": "ok",
  "added": 1,
  "instructions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "apiVersion": "v1",
      "cmd": "run_python",
      "params": {
        "code": "rover.forward(60)\ntime.sleep(2)\nrover.stop()",
        "id": "mission-abc123"
      },
      "timestamp": "2026-05-14T10:30:00.000Z",
      "status": "pending"
    }
  ]
}
```

**Error (400 Bad Request):**
```json
{
  "apiVersion": "v1",
  "status": "error",
  "error": "Code validation failed",
  "validation_errors": ["Forbidden import: os"],
  "added": 0,
  "instructions": []
}
```

**Unsupported API Version (400 Bad Request):**
```json
{
  "apiVersion": "v1",
  "status": "error",
  "error": "Unsupported API version: v2. Supported versions: v1",
  "unsupportedVersion": true,
  "added": 0,
  "instructions": []
}
```

#### Instruction Status Values

| Status | Description |
|--------|-------------|
| `pending` | Queued, not yet started (physical rovers only) |
| `executing` | Currently running (physical rovers only) |
| `completed` | Execution finished successfully |
| `error` | Execution failed |

**Note:** Simulators execute synchronously, so instructions return with `status: "completed"` immediately.

---

### 2. Clear Queue (Emergency Stop)

**Endpoint:** `POST /queue/clear`

Clears all pending instructions from the rover's queue. Used for emergency stops.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:** Empty or `{}`

#### Response

**Success (200 OK):**
```json
{
  "status": "ok",
  "message": "Queue cleared",
  "cleared": 3
}
```

**Simulator Response:**
```json
{
  "status": "ok",
  "message": "Queue cleared (simulator executes synchronously, no queue to clear)",
  "cleared": 0
}
```

---

## API Versioning

### Why API Versioning?

API versioning allows the system to:
- Handle different rover software versions without breaking changes
- Introduce new features (v2, v3) while maintaining backward compatibility
- Detect and warn about version mismatches
- Future-proof the architecture

### Version Negotiation

1. **Client sends request** with `apiVersion: "v1"`
2. **Rover validates** the version against supported versions
3. **Rover responds** with its `apiVersion` in the response
4. **Client checks** for version mismatches or `unsupportedVersion: true`

### Supported Versions

| Version | Status | Description |
|---------|--------|-------------|
| `v1` | ✅ Active | Initial unified API version |
| `v2` | 🚧 Future | TBD |

---

## Python Code Constraints

### Allowed Imports
- `time` module (for delays and timing)
- Rover module is pre-loaded as `rover`

### Allowed Rover Commands
```python
# Movement
rover.forward(speed)      # speed: 0-100
rover.reverse(speed)      # speed: 0-100
rover.spinLeft(speed)     # speed: 0-100
rover.spinRight(speed)    # speed: 0-100
rover.steerLeft(speed, degrees)   # speed: 0-100, degrees: 0-50
rover.steerRight(speed, degrees)  # speed: 0-100, degrees: 0-50
rover.stop()

# Sensors (if available)
rover.getDistance()
rover.getHeading()
```

### Security Restrictions
The following are **forbidden** and will cause validation errors:
- ❌ File system access (`open`, `read`, `write`)
- ❌ Network access (`socket`, `urllib`, `requests`)
- ❌ System commands (`os.system`, `subprocess`)
- ❌ Dangerous imports (`eval`, `exec`, `__import__`)
- ❌ Malicious code patterns

---

## Error Handling

### Common Error Scenarios

| Error Code | Scenario | Client Action |
|------------|----------|---------------|
| 400 | Invalid payload format | Fix request structure |
| 400 | Unsupported API version | Update client or rover software |
| 400 | Code validation failed | Review Python code for forbidden operations |
| 404 | Endpoint not found | Check rover is running correct software version |
| 500 | Internal server error | Check rover logs, retry request |
| Timeout | Rover unreachable | Check network connection, verify rover IP/port |

---

## Integration Examples

### TypeScript (Mission Control)

```typescript
import { RoverHttpClient } from '@/infrastructure/rover/RoverHttpClient';
import { createRoverPayload } from '@/infrastructure/rover/types/RoverPayload';

// Create client
const client = new RoverHttpClient();

// Build payload
const payload = createRoverPayload(
  'rover.forward(60)\ntime.sleep(2)\nrover.stop()',
  'mission-abc123',
  'v1'  // API version
);

// Send to rover
const result = await client.sendMissionToRover(
  '192.168.1.100',
  8523,
  payload
);

if (result.success) {
  console.log(`Mission queued: ${result.id}`);
} else {
  console.error(`Failed: ${result.message}`);
}
```

### Python (Physical Rover Server)

```python
# Expected endpoint implementation on Pi Zero
@app.route('/queue/add', methods=['POST'])
def queue_add():
    instructions = request.get_json()
    
    # Validate API version
    for instruction in instructions:
        api_version = instruction.get('apiVersion', 'v1')
        if api_version != 'v1':
            return jsonify({
                'apiVersion': 'v1',
                'status': 'error',
                'error': f'Unsupported API version: {api_version}',
                'unsupportedVersion': True
            }), 400
    
    # Process instructions...
    # Add to queue, return response
```

---

## Migration Guide

### Migrating from Legacy `/api/execute` (Pre-v1)

**Before (Legacy):**
```json
POST /api/execute
{
  "code": "rover.forward(60)"
}
```

**After (v1):**
```json
POST /queue/add
[
  {
    "apiVersion": "v1",
    "cmd": "run_python",
    "params": {
      "code": "rover.forward(60)",
      "id": "mission-123"
    }
  }
]
```

**Key Changes:**
1. Endpoint changed from `/api/execute` to `/queue/add`
2. Request body is now an array (supports batch operations)
3. Added `apiVersion` field
4. Added `cmd` field (currently only `run_python` supported)
5. Wrapped code in `params` object with mission `id`

---

## Testing

### Health Check

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "service": "rover-simulator-v2"
}
```

### Execute Simple Mission

```bash
curl -X POST http://localhost:8080/queue/add \
  -H "Content-Type: application/json" \
  -d '[{
    "apiVersion": "v1",
    "cmd": "run_python",
    "params": {
      "code": "rover.forward(60)\ntime.sleep(1)\nrover.stop()",
      "id": "test-mission-001"
    }
  }]'
```

### Emergency Stop

```bash
curl -X POST http://marspi.local:8523/queue/clear \
  -H "Content-Type: application/json"
```

---

## Rover Type Identification

To prevent accidental code execution on the wrong hardware, operators should configure rover metadata:

| Field | Physical Rover | Simulator |
|-------|---------------|-----------|
| `roverType` | `physical` | `simulator` |
| `roverTag` | `marspi` | `simulator-1` |
| `name` | "Rover Alpha-1" | "Cloud Simulator" |
| Visual Indicator | 🤖 Physical | 🖥️ Simulator |

**UI Badge Examples:**
- Physical: ![Badge](https://img.shields.io/badge/🤖_Physical-blue)
- Simulator: ![Badge](https://img.shields.io/badge/🖥️_Simulator-purple)

---

## Future API Versions

### Planned for v2
- Batch status queries (`GET /queue/status`)
- Instruction cancellation (`DELETE /queue/{instructionId}`)
- Real-time execution streaming via WebSocket
- Enhanced error codes and debugging info
- Support for new rover hardware capabilities

---

## Support

**Documentation:** `/docs/ROVER_API_V1.md`  
**Issues:** [GitHub Issues](https://github.com/your-org/mars-rover-mission-control/issues)  
**Contact:** mission-control-team@example.com

---

**© 2026 Mars Rover Mission Control Team**
