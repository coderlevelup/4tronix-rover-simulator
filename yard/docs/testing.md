# Testing Guide

## Test Suites

The rover server has two test suites:

| Suite | File | Tests | What it tests |
|-------|------|-------|---------------|
| Unit | `test_service.py` | 26 | Queue logic, instruction execution, threading |
| Integration | `test_integration.py` | 26 | Flask endpoints, HTTP layer, end-to-end flow |

## Running Tests

```bash
cd yard/rover
source ../venv/bin/activate

# Run all tests
python -m pytest -v

# Run unit tests only (faster)
python -m pytest test_service.py -v

# Run integration tests only
python -m pytest test_integration.py -v

# Run with coverage
python -m pytest --cov=. --cov-report=html
```

## Unit Tests (test_service.py)

Unit tests call `RoverQueueService` directly without HTTP:

```python
def test_add_single_instruction(self):
    result = self.service.add_instructions([
        {'cmd': 'forward', 'params': {'speed': 60, 'seconds': 1}}
    ])

    assert result['status'] == 'ok'
    assert result['added'] == 1
```

### Test Categories

- **TestRoverQueueService**: add_instructions, get_status, clear_queue, get_health
- **TestQueueProcessor**: execution order, history updates, interrupt handling
- **TestInstructionExecution**: each command type calls correct driver methods

### Dependency Injection for Tests

Tests inject fixed time and UUID providers for deterministic results:

```python
self.service = RoverQueueService(
    driver=MockRoverDriver(),
    time_provider=lambda: datetime(2024, 1, 15, 12, 0, 0),
    uuid_provider=lambda: f"test-uuid-{counter}"
)
```

## Integration Tests (test_integration.py)

Integration tests use Flask's test client:

```python
@pytest.fixture
def client():
    driver = MockRoverDriver()
    service = RoverQueueService(driver=driver)
    create_app(service)

    with app.test_client() as client:
        yield client

def test_add_returns_200(self, client):
    response = client.post('/queue/add', json=[
        {'cmd': 'forward', 'params': {'speed': 60}}
    ])
    assert response.status_code == 200
```

### Test Categories

- **TestHealthEndpoint**: /health responses
- **TestQueueAddEndpoint**: /queue/add validation and responses
- **TestQueueStatusEndpoint**: /queue/status responses
- **TestQueueClearEndpoint**: /queue/clear behavior
- **TestEndToEndFlow**: full instruction lifecycle with processor

## Manual Testing

### Test Rover Server (Mock Mode)

On any machine (not Pi), the server auto-detects and uses MockRoverDriver:

```bash
cd yard/rover
python rover_server.py
# Output: "Using MockRoverDriver (not on Pi)"

# Test with curl
curl -X POST http://localhost:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 1}}]'

# Watch server logs for mock commands:
# [MOCK] Forward at speed 60
# [MOCK] Stop
```

### Test Tablet Client (Mock Mode)

```
http://localhost:5050/code/?mock=true
```

In mock mode:
- Shows mock output panel below Blockly workspace
- Displays exactly what instructions would be sent
- No network calls - works completely offline

### End-to-End Test

1. Start rover server: `cd yard/rover && python rover_server.py`
2. Start satellite: `cd yard/satellite && ROVER_URL=http://localhost:8523 python web_server.py`
3. Open `/code/` in browser
4. Create program: Forward 1s, Spin Left 0.5s, Forward 1s
5. Click Run
6. Verify queue status updates
7. Click Stop mid-execution
8. Verify immediate stop and queue clear

## Mock Driver

The `MockRoverDriver` logs all commands instead of controlling hardware:

```python
class MockRoverDriver(RoverDriver):
    def forward(self, speed):
        print(f"[MOCK] Forward at speed {speed}")

    def stop(self):
        print(f"[MOCK] Stop")
```

Auto-detection logic in `create_driver()`:
- Checks for `/dev/i2c-1` (Pi I2C bus)
- If found: returns `RealRoverDriver`
- If not found: returns `MockRoverDriver`

## Writing New Tests

### Unit Test Template

```python
def test_new_feature(self):
    # Arrange
    self.service.add_instructions([...])

    # Act
    result = self.service.some_method()

    # Assert
    assert result['status'] == 'ok'
```

### Integration Test Template

```python
def test_new_endpoint(self, client):
    # Act
    response = client.post('/new/endpoint', json={...})

    # Assert
    assert response.status_code == 200
    data = response.get_json()
    assert data['field'] == 'expected'
```

### Testing Async Behavior

For tests involving the queue processor:

```python
def test_processor_completes(self, client_with_processor):
    # Add instruction
    client_with_processor.post('/queue/add', json=[
        {'cmd': 'forward', 'params': {'seconds': 0.1}}
    ])

    # Wait for execution
    time.sleep(0.3)

    # Check completion
    response = client_with_processor.get('/queue/status')
    data = response.get_json()
    assert data['history_count'] >= 1
```
