# 4tronix Rover Simulator Repo Context for Cloud Platform Planning

## Purpose

This document is a current repo briefing for an external planning/design assistant such as Claude. It explains what exists today, what each part of the repo does, what is reusable for a cloud platform, where the technical risks are, and how the current code relates to the planned stack:

- Frontend/backend direction: TypeScript
- Auth/data/platform direction: Firebase + Google Cloud

Read this together with:

- `CLOUD_PLATFORM_QUESTIONS.md` for open product and architecture decisions
- `/Users/hlali/Documents/INF4027W/azure_devops_import_new.csv` for backlog and MVP intent

## Executive Summary

This repository currently contains three overlapping generations of the rover platform:

1. A desktop simulator path
   - PyQt6 simulator UI with an HTTP control surface
   - Useful for local development and API compatibility

2. A direct-control web path
   - Flask pages that directly send commands to either the simulator or the real rover
   - Useful as a prototype and operator UI reference

3. A Yard classroom path
   - Queue-based rover service
   - Separate satellite web server
   - Blockly + Python submission
   - Monitor screen with camera + queue state
   - SSE status streaming
   - Mock-vs-real driver abstraction
   - This is the strongest foundation for a future cloud platform

If the goal is a cloud platform, the best source architecture is `yard/`, not the older direct-control Flask UI.

## What the repo already proves is possible

At a capability level, this repo already demonstrates that the platform can:

- Preserve a rover-like Python programming API for both simulation and real hardware
- Accept high-level rover commands over HTTP
- Accept lower-level hardware-shaped payloads for compatibility
- Run a local desktop simulation of rover motion and steering
- Drive the real rover over HTTP on a local network
- Expose a browser UI for manual control and simple scripted sequences
- Stream camera frames over WebSocket
- Overlay AI detections on camera frames when using the Pi AI camera path
- Queue rover instructions and execute them sequentially
- Provide emergency stop / queue clear behavior
- Push live queue status to browsers via SSE
- Let learners submit Blockly-generated Python or raw Python
- Show a shared monitor view with live queue state and camera feed
- Run in mock mode without rover hardware for development/testing

That means the repo already contains enough behavior to design:

- A cloud mission queue
- A cloud operator console
- A browser coding interface
- A simulator-backed preflight workflow
- A rover-agent bridge from hardware to cloud
- A live mission monitoring experience

## Repo structure

### Root

- `README.md`
  - Main repo introduction and simulator usage

- `roversimui.py`
  - PyQt6 desktop simulator
  - Runs an embedded Flask server on port `8524`
  - Accepts rover commands over HTTP
  - Models rover pose, heading, and wheel steering
  - Imports `RTCWindow` support and can participate in streaming workflows

- `roversimulator.py`
  - Thin compatibility wrapper around `RoverWebDriver`
  - Points to the simulator HTTP endpoint at `http://127.0.0.1:8524/`
  - Lets user code do `import roversimulator as rover`

- `rover_web_driver.py`
  - Main HTTP driver abstraction
  - Exposes a rover-style Python API
  - Converts Python method calls into HTTP POST requests
  - Reusable boundary for simulator or real rover control

- `pi_camera_stream.py`
  - Root-level camera streaming implementation
  - WebSocket-based JPEG streaming
  - AI detection overlay support

- `connect_to_real_rover.py`
  - Small example of using `RoverWebDriver` against a real rover host

- Example scripts
  - `square.py`
  - `move-rover.py`
  - `driveRover.py`
  - `very-simple-example.py`

- Tests
  - `tests/test_rtc_implementation.py`
  - `tests/simple_test.py`

### `real-rover/`

This is the real hardware path for the 4tronix rover.

- `real-rover/rover.py`
  - Hardware control library for the rover
  - Direct GPIO / servo / sensor / LED behavior

- `real-rover/rover_server.py`
  - Flask HTTP server for real rover control on port `8523`
  - Accepts both:
    - high-level command payloads such as `{"command":"forward","speed":60}`
    - low-level payloads containing `wheelMotors`, `servos`, `rgbLeds`
  - Also drives LED patterns and steering servo coordination

- `real-rover/pi_camera_stream.py`
  - Older or alternative camera streaming implementation

- `real-rover/requirements_pi.txt`
  - Pi-specific dependencies including `picamera2`, `opencv-python`, `websockets`, Flask, and requests

### `web_interface/`

This is the older browser control path.

- `web_interface/web_interface.py`
  - Flask server with direct control routes for the real rover and simulator
  - Supports per-command and timed sequence execution

- `web_interface/templates/`
  - `real.html`
  - `sim.html`
  - `index.html`
  - `rtc_index.html`

- `web_interface/rtc_client.py`
  - Browser/client-side streaming support helper

- `web_interface/run_simulator_with_streaming.py`
  - Convenience launcher for simulator + streaming

This layer is best treated as a prototype/reference UI, not the base of the cloud platform.

### `yard/`

This is the most cloud-relevant subsystem.

- `yard/rover/`
  - Queue-based rover control service
  - Cleanest backend architecture in the repo

- `yard/satellite/`
  - Separate web server for the learner tablet UI and the shared monitor
  - Proxies API calls to the rover server
  - Hosts the camera stream in the current physical deployment model

- `yard/docs/`
  - Strong existing architecture and API documentation

## Current runtime architectures

## 1. Desktop simulator architecture

### Main files

- `roversimui.py`
- `roversimulator.py`
- `rover_web_driver.py`

### How it works

1. `roversimui.py` starts a PyQt6 window.
2. It starts an embedded Flask HTTP server on port `8524`.
3. `roversimulator.py` binds the rover-like Python API to `http://127.0.0.1:8524/`.
4. User code calls rover methods through the wrapper.
5. The simulator updates its motion state and redraws the rover.

### What the simulator models

- Vehicle `x/y` position
- Heading
- Servo angles
- Forward/reverse/spin behavior
- Steering arc behavior using approximate turning-circle math

### What it does not model well yet

- Obstacles or terrain
- Sensor realism
- Multi-user isolation
- Session persistence
- Cloud-grade lifecycle management
- A browser-native simulator

### Why it matters for the cloud platform

The simulator already preserves the rover API. That is valuable because the future browser simulator can target the same conceptual command set even if the implementation moves from Python/PyQt to TypeScript/Canvas/WebGL.

## 2. Real rover local network architecture

### Main files

- `real-rover/rover_server.py`
- `real-rover/rover.py`
- `rover_web_driver.py`

### How it works

1. The rover Pi runs `real-rover/rover_server.py` on port `8523`.
2. Clients send JSON commands over HTTP.
3. The server translates the payload into direct rover hardware calls.
4. It also manages LED patterns and steering servo behavior.

### Supported command styles

#### High-level commands

Examples:

```json
{"command":"forward","speed":60}
{"command":"spinLeft","speed":50}
{"command":"steerRight","degrees":20,"seconds":1,"speed":60}
```

#### Low-level compatibility payload

Example:

```json
{
  "wheelMotors": {
    "l": [100, 0],
    "r": [100, 0]
  },
  "servos": {
    "9": 0,
    "11": 0,
    "13": 0,
    "15": 0
  },
  "rgbLeds": {
    "0": [255, 255, 255]
  }
}
```

### Why it matters for the cloud platform

This is the simplest and most proven rover execution endpoint. Even if the long-term cloud system uses a persistent bridge instead of raw HTTP, this file defines the hardware-level command vocabulary that must still be supported somewhere.

## 3. Yard classroom architecture

### Main files

- `yard/rover/rover_server.py`
- `yard/rover/service.py`
- `yard/rover/drivers.py`
- `yard/satellite/web_server.py`
- `yard/satellite/camera_server.py`
- `yard/satellite/templates/code.html`
- `yard/satellite/templates/monitor.html`
- `yard/docs/architecture.md`
- `yard/docs/api.md`

### Current physical model

The docs describe a three-device setup:

- Tablet/browser for learners
- Satellite device serving web UI and camera stream
- Rover device executing missions

### Why this matters

This is already structurally close to a cloud platform:

- The learner UI is separated from rover execution
- The rover has a queue service instead of direct control only
- There is a monitor/operator surface
- There is an evented status stream
- There is an adapter boundary between app logic and hardware

## Yard rover backend details

### `yard/rover/service.py`

This is the core application service.

It currently provides:

- A thread-safe in-memory instruction queue using `deque`
- History tracking
- Current-instruction state
- Background queue processor thread
- Emergency stop support via `_stop_requested`
- SSE subscriber fan-out
- Support for both movement commands and `run_python`

### Supported queue commands

The queue service executes:

- `forward`
- `backward` / `reverse`
- `spin_left`
- `spin_right`
- `steer_left`
- `steer_right`
- `stop`
- `wait`
- `run_python`

### `run_python` behavior

`run_python` is especially important because it shows the repo has already moved beyond pure block sequences.

Today it:

- Receives Python code as text
- Exposes `rover` and `time` to the executed script
- Overrides `time.sleep` with an interruptible wait
- Restricts builtins to a small safe subset
- Tries to import real `rover` on Pi
- Falls back to `roversimulator` when not on hardware

This is a major proof point for cloud planning because it shows the current product direction is not only “queue some motion blocks”, but “submit executable learner programs”.

### Current safety limitations in `run_python`

The current sandbox is not cloud-grade. It is useful, but not sufficient for hostile or multi-tenant internet usage.

Current gaps:

- Uses `exec()` directly
- No process isolation
- No container or VM boundary
- No CPU quota or memory quota
- No static AST allowlist enforcement
- No persistent per-user tenancy boundary
- No strong import escape analysis beyond limited globals/builtins

Implication: for the new platform, `run_python` is a product proof, not a production-ready security model.

### `yard/rover/drivers.py`

This file is one of the best reuse points in the repo.

It provides:

- `RoverDriver` abstract interface
- `MockRoverDriver`
- `RealRoverDriver`
- `create_driver()` environment detection

Why it matters:

- It already separates application logic from hardware specifics
- It already supports local development without hardware
- It maps closely to the future idea of a cloud backend plus rover-side execution agent

The future cloud system should preserve this idea, even if implemented in TypeScript interfaces instead of Python abstract base classes.

### `yard/rover/rover_server.py`

This is a thin Flask adapter over `RoverQueueService`.

Endpoints:

- `POST /queue/add`
- `POST /queue/clear`
- `GET /queue/status`
- `GET /queue/events`
- `GET /health`

This is a very good example of keeping transport thin and pushing business logic into a service layer.

## Yard satellite details

### `yard/satellite/web_server.py`

This server:

- Serves `/code/` for learner interaction
- Serves `/monitor/` for the big-screen display
- Proxies queue calls to the rover
- Proxies the rover SSE stream to browsers
- Exposes a health endpoint with rover connectivity state

This is effectively a primitive API gateway + frontend server.

### `yard/satellite/camera_server.py`

This server:

- Runs a WebSocket service on port `8890`
- Captures frames from the Pi AI camera
- Runs IMX500 object detection
- Draws detection overlays
- Broadcasts base64 JPEG frames to all connected clients

This proves the repo already supports:

- Shared live viewing
- AI-overlay video
- A clean split between mission control UI and video pipeline

But it is not yet a scalable cloud video architecture. It is a single-node broadcaster.

### `yard/satellite/templates/code.html`

The current learner UI is more capable than a simple Blockly page.

It includes:

- A Blockly pane
- A Python editor pane
- Run / stop / clear actions
- Mock mode support
- PWA setup via manifest and service worker

That means the future platform does not need to invent the product concept from scratch. The repo already demonstrates a dual-mode coding experience:

- visual programming
- text programming

### `yard/satellite/templates/monitor.html`

The monitor page combines:

- live camera view
- queue state
- rover status / connection details
- display logic for current, pending, and historical instructions

This is the strongest current reference for a future operator console / mission control surface.

## Older web interface details

### `web_interface/web_interface.py`

This older layer provides:

- Direct command routes for real rover
- Direct command routes for simulator
- Timed sequence execution
- Browser pages for real/sim targets

It is useful as:

- a UI interaction reference
- a reminder of the simplest command API shape

It is not the best source for the cloud architecture because it couples browser requests directly to live rover control instead of going through a queue or mission service.

## Camera and streaming status

The repo contains multiple streaming approaches or experiments:

- WebSocket JPEG streaming in `pi_camera_stream.py`
- Pi AI camera streaming in `yard/satellite/camera_server.py`
- RTC/WebRTC-related code and tests:
  - `rtc_window.py`
  - `rtc_window.py` imports in the simulator
  - `tests/test_rtc_implementation.py`
  - `web_interface/rtc_client.py`

Important nuance:

- The camera and monitor path that is clearly operational today is WebSocket + JPEG/base64
- There are RTC/WebRTC artifacts in the repo, but this does not yet look like a finished, production-ready WebRTC pipeline

For planning, treat current video support as:

- proven: local WebSocket frame streaming
- exploratory/incomplete: WebRTC path

## Existing APIs and abstractions worth preserving

### 1. Rover command vocabulary

The repo already converges around these rover concepts:

- move forward
- move reverse/backward
- spin left/right
- steer left/right
- stop
- wait

Even if the cloud platform changes languages and frameworks, this logical API should survive.

### 2. Driver abstraction

The `RoverDriver` pattern is strong and should be re-created in the new platform as a boundary between:

- mission execution logic
- actual rover hardware transport

### 3. Queue-first execution

The Yard model is correct for real hardware sharing:

- accept missions
- enqueue
- execute in order
- provide history
- support emergency stop

That is much closer to a cloud education platform than direct remote driving.

### 4. Event streaming

The SSE approach used for queue updates is simple and effective for:

- queue state
- mission status
- operator dashboard refresh

The cloud version could keep SSE for mission status while using another transport for rover-agent communication.

## What is mature vs experimental

### Mature / reusable ideas

- Rover-style Python API
- HTTP-based command transport
- Queue-based rover execution
- Hardware abstraction via drivers
- Blockly + Python learner workflow
- Shared monitor concept
- Emergency stop concept
- SSE status streaming
- Mock-vs-real execution mode

### Useful but not production-grade

- `run_python` sandbox
- WebSocket JPEG video broadcasting
- Older direct-control web UI
- Simulator streaming path

### Experimental / uncertain

- RTC/WebRTC support
- Production safety model for internet-facing learner code execution
- Multi-tenant cloud concerns
- Persistent mission storage
- Authentication and role system
- Multi-rover orchestration

## Testing status

The Yard subsystem is the most testable part of the repo.

Relevant indicators:

- `yard/rover/test_service.py`
- `yard/rover/test_integration.py`
- Architecture docs mention 52 tests in the Yard path

This matters because it suggests the Yard backend is not just a prototype; it was intentionally structured for testability.

By contrast, the broader repo is more mixed, with some exploratory or hardware-bound code paths that are harder to treat as production-grade foundations.

## Dependencies and runtime shape

### Root dependencies

The repo currently centers on Python with:

- Flask
- PyQt6
- requests
- OpenCV
- numpy
- websockets

### Pi-specific dependencies

The hardware/camera path additionally relies on:

- `picamera2`
- Pi/Linux-only dependencies
- rover hardware libraries and GPIO stack

Implication:

The current repo is operationally Python-first and device-local. The cloud platform will be a technology shift, not a simple deployment lift.

## What the Azure DevOps CSV tells us

The file `/Users/hlali/Documents/INF4027W/azure_devops_import_new.csv` adds important product context.

It describes epics around:

- operator authentication
- browser editor + sandbox
- browser-based simulator
- cloud mission queue
- rover-side execution agent
- operator console
- recording/upload pipeline
- mission history

It also includes acceptance criteria and tests for many of those areas.

### Important mismatch to call out

The CSV backlog assumes several implementation choices that do not fully match the current direction you stated:

- CSV assumption: FastAPI backend, Redis queue
- Current direction from user: TypeScript + Firebase + Google Cloud

That means the CSV is still highly useful for:

- product scope
- workflows
- acceptance criteria
- MVP sequencing
- non-functional requirements

But it should not be treated as the final implementation spec for backend technology.

### Best way to interpret the CSV

Treat it as a backlog of product intentions, not as an authoritative architecture choice.

For example:

- Firebase Auth can replace the CSV’s backend-auth assumptions
- Firestore / Firebase + GCP services can replace parts of the Redis/FastAPI assumption
- Cloud Run / Functions / Pub/Sub / Firestore can be mapped onto the mission queue architecture

## Implications for the new TypeScript + Firebase + GCP platform

Based on the current repo, the cleanest interpretation is:

### What should be reused conceptually

- Mission queue model from `yard/rover/service.py`
- Driver/adapter boundary from `yard/rover/drivers.py`
- Learner coding workflow from `yard/satellite/templates/code.html`
- Monitor/operator workflow from `yard/satellite/templates/monitor.html`
- Rover command vocabulary from `rover_web_driver.py` and rover servers
- Simulator parity goal from `roversimui.py`

### What should be reimplemented in the new stack

- Frontend in TypeScript
  - likely React/Next.js or similar
- Auth and role management in Firebase Auth
- Mission and history data in Firebase/Firestore
- Cloud services on GCP
- Safer code validation/execution model
- Browser-native simulator
- Production-grade video/recording pipeline

### What should likely run on the physical rover side

The current repo suggests the future platform still needs a rover-local agent or gateway responsible for:

- maintaining a trusted outbound connection to cloud
- receiving approved missions
- mapping mission commands to hardware calls
- enforcing local safety stop behavior
- reporting status back to cloud
- optionally recording or relaying video

That rover-local role is already hinted at by the current split between:

- queue service
- real rover driver
- camera server

## Suggested mapping from current repo to cloud platform components

### Learner app

Source inspiration:

- `yard/satellite/templates/code.html`

Cloud version:

- TypeScript web app
- Blockly and/or Monaco/CodeMirror editor
- simulator run
- mission submit
- mission history

### Operator console

Source inspiration:

- `yard/satellite/templates/monitor.html`

Cloud version:

- authenticated operator UI
- queue management
- mission status
- estop
- video feed
- rover health

### Mission queue service

Source inspiration:

- `yard/rover/service.py`
- `yard/rover/rover_server.py`

Cloud version:

- TypeScript service
- persistent mission state
- queue semantics
- mission transitions
- audit log

### Rover execution agent

Source inspiration:

- `yard/rover/drivers.py`
- `real-rover/rover_server.py`

Cloud version:

- rover-side agent process on Pi
- secure cloud connection
- mission execution boundary
- local safety enforcement

### Simulator

Source inspiration:

- `roversimui.py`
- `roversimulator.py`

Cloud version:

- browser-native 2D or 3D simulator in TypeScript
- same logical rover API
- potentially a command playback engine instead of arbitrary Python execution

### Video pipeline

Source inspiration:

- `yard/satellite/camera_server.py`
- `pi_camera_stream.py`

Cloud version:

- lower-latency live stream path
- recording pipeline
- cloud storage and playback

## Key limitations Claude should know before planning

1. The current repo is not a cloud backend.
   It is a set of local-network and device-local systems.

2. The current Python execution model is not secure enough for internet-scale, untrusted code execution.

3. The current queue is in-memory, not durable.

4. The current video path is not designed for broad concurrent scale.

5. The simulator is desktop-native, not browser-native.

6. Authentication, tenancy, and long-term persistence are mostly absent from the current codebase.

7. The repo proves product direction and execution semantics better than it proves final cloud infrastructure choices.

## Strongest reusable assets in this repo

If only a few parts are used as canonical references for the new platform, they should be:

1. `yard/rover/service.py`
   - best expression of queue and mission execution semantics

2. `yard/rover/drivers.py`
   - best expression of boundary between business logic and hardware

3. `yard/satellite/templates/code.html`
   - best evidence of the intended learner programming UX

4. `yard/satellite/templates/monitor.html`
   - best evidence of the intended mission control UX

5. `rover_web_driver.py`
   - best compact expression of the rover command API surface

6. `real-rover/rover_server.py`
   - best expression of how commands ultimately hit the rover hardware today

## Bottom-line recommendation for planning

When designing the new platform, Claude should treat this repo as:

- a strong source of product workflows
- a strong source of rover command semantics
- a strong source of queue/execution concepts
- a moderate source of simulator math and monitor UX
- a weak source of final cloud infrastructure and security design

The cloud platform should be designed as a new system in TypeScript on Firebase + Google Cloud, but one that deliberately preserves:

- the rover command model
- the queue-based execution model
- the learner Blockly/Python workflow
- the operator/monitor workflow
- the distinction between cloud orchestration and rover-local execution

## Recommended next planning outputs

After reading this repo context, the next useful design documents would be:

1. A target cloud architecture diagram
2. A canonical mission lifecycle specification
3. A canonical rover command schema
4. A simulator parity spec listing what must match the real rover
5. A rover-agent protocol spec between cloud and physical rover
6. A security model for learner code validation and execution
7. An MVP scope doc aligned to TypeScript + Firebase + GCP instead of FastAPI + Redis

