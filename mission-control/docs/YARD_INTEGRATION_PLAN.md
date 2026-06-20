# Yard Integration Plan: Local System → Cloud Platform

**Goal:** Integrate the local Yard classroom system with the cloud-based Mars Rover Mission Control platform, making it easy for operators to manage both physical rovers and simulators through a unified interface.

**Date:** May 14, 2026  
**Branch:** `Yard_Mode_Setup`  
**Status:** 🔵 Planning Phase

---

## Executive Summary

### Current State
- **Local Yard System** (`4tronix-rover-simulator`): 3 Raspberry Pis (rover, satellite, camera) with SSE-based queue, Blockly interface, and TV monitor
- **Cloud Platform** (`mars-rover-mission-control`): Next.js operator console with Firebase backend, mission queue, rover config management, Python simulator

### Key Integration Challenges
1. **Unified API**: Make simulator use the same API as physical rover (differ only by tag/identifier)
2. **Mission Execution Flow**: Change from "Run on Rover/Simulator" buttons to single "Run" that opens execution page
3. **Rover Selection UX**: Pre-selected rover with quick dropdown switcher
4. **Visual Feed Switching**: Camera feed (physical) ↔ Simulator view (virtual) based on rover type
5. **Ground Station Agent**: Bridge between cloud platform and local rover hardware

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Platform (Firebase)                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Operator      │  │  Mission       │  │  Rover Config    │  │
│  │  Console       │  │  Queue         │  │  Management      │  │
│  │  (Next.js)     │  │  (Firestore)   │  │  (Firestore)     │  │
│  └────────┬───────┘  └────────┬───────┘  └────────┬─────────┘  │
│           │                   │                   │              │
└───────────┼───────────────────┼───────────────────┼──────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────────────────────────────────────────┐
    │         Rover Dispatch Service (New)              │
    │  - Routes missions to correct endpoint            │
    │  - Handles simulator vs physical routing          │
    │  - Manages connection health checks               │
    └───────────┬───────────────────────┬───────────────┘
                │                       │
                ▼                       ▼
    ┌───────────────────┐   ┌──────────────────────────┐
    │  Cloud Simulator  │   │  Ground Station Agent    │
    │  (Flask :8080)    │   │  (GSA - runs on Pi)      │
    │  - Physics engine │   │  - Proxies to local      │
    │  - Validation     │   │    rover :8523           │
    │  - Visual output  │   │  - Sends to cloud        │
    └───────────────────┘   └───────────┬──────────────┘
                                        │
                                        ▼
                            ┌──────────────────────────┐
                            │  Local Rover Pi          │
                            │  (marspi.local:8523)     │
                            │  - Queue processor       │
                            │  - Real hardware driver  │
                            └──────────────────────────┘
```

---

## Phase 1: API Unification & RoverConfig Enhancement

### 1.1 Update RoverConfig Schema

**Files to modify:**
- `src/core/domain/entities/RoverConfig.ts`
- `src/infrastructure/validation/roverConfigValidation.ts`
- Firestore migration script

**Changes:**
```typescript
// Add to RoverConfig interface
export type RoverType = 'physical' | 'simulator';

export interface RoverConfig {
  // ... existing fields
  
  // NEW FIELDS
  roverType: RoverType;              // 'physical' | 'simulator'
  simulatorEndpoint?: string;        // Optional: custom simulator URL
  visualFeedType: 'camera' | 'sim';  // Camera stream or simulator canvas
  
  // RENAME
  roverTag: string;                  // Keep as unified identifier
}
```

**Migration considerations:**
- Existing configs default to `roverType: 'physical'`
- Cloud simulator uses: `roverType: 'simulator'`, `ipAddress: 'localhost'`, `port: 8080`

### 1.2 Standardize Rover API Contract

**Goal:** Both physical rover and simulator accept the same instruction format.

**Current state:**
- **Yard rover** (`yard/rover/rover_server.py`): Accepts queue instructions like `{cmd: 'forward', params: {speed: 60, seconds: 2}}`
- **Cloud simulator** (`simulator-service/simulator_api.py`): Currently has different API shape

**Action items:**
1. Review and document Yard rover API endpoints (from `yard/docs/api.md`)
2. Update cloud simulator to match the same contract
3. Create unified TypeScript client interface

**Target API format:**
```typescript
// POST /queue/add
{
  instructions: [
    { cmd: 'forward', params: { speed: 60, seconds: 2 } },
    { cmd: 'steer_left', params: { degrees: 20, speed: 50, seconds: 3 } },
    { cmd: 'stop', params: {} }
  ]
}

// OR for Python code execution
{
  instructions: [
    { cmd: 'run_python', params: { code: string, blockly_state?: string } }
  ]
}
```

### 1.3 Create Rover Dispatch Service

**New file:** `src/infrastructure/rover/RoverDispatchService.ts`

```typescript
export class RoverDispatchService {
  async dispatch(config: RoverConfig, instructions: Instruction[]): Promise<DispatchResult> {
    const endpoint = this.getEndpoint(config);
    
    // Route to correct destination
    if (config.roverType === 'simulator') {
      return this.sendToSimulator(endpoint, instructions);
    } else {
      return this.sendToPhysicalRover(endpoint, instructions);
    }
  }
  
  private getEndpoint(config: RoverConfig): string {
    if (config.roverType === 'simulator') {
      return config.simulatorEndpoint || 'http://localhost:8080';
    }
    return `http://${config.ipAddress}:${config.port}`;
  }
}
```

---

## Phase 2: Mission Execution Flow Redesign

### 2.1 Remove Dual "Run" Buttons

**Current:** Queue list has "Run on Rover" and "Run in Simulator" buttons  
**New:** Single "Run" button that opens execution page

**Files to modify:**
- `src/components/operator/QueueListScaffold.tsx`

**Changes:**
```tsx
// REMOVE these handlers
const handleRunOnRover = async (missionId: string) => { ... }
const handleRunSimulator = (missionId: string) => { ... }

// ADD single handler
const handleOpenMission = (missionId: string) => {
  router.push(`/operator/rover/execute/${missionId}`);
}

// UPDATE button
<button onClick={() => handleOpenMission(mission.id)}>
  Run
</button>
```

### 2.2 Create Mission Execution Page

**New file:** `src/app/operator/rover/execute/[missionId]/page.tsx`

**Features:**
- Pre-populated rover selector (from active config)
- Quick-switch dropdown to select different rover
- "Execute" button to dispatch mission
- Visual feed area (conditional: camera or simulator)
- Real-time execution status from SSE
- Emergency stop button

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Mission: {missionName}                              │
│  ┌────────────────┐  [Quick Switch ▼]   [Execute]   │
│  │ Selected Rover │                                   │
│  │ 🤖 Rover Alpha │                                   │
│  │ Type: Physical │                                   │
│  └────────────────┘                                   │
├──────────────────────────────────────────────────────┤
│                                                        │
│         ┌─────────────────────┬─────────────┐        │
│         │                     │  Execution  │        │
│         │   Camera Feed       │   Status    │        │
│         │   or Simulator      │             │        │
│         │   Canvas            │  • Queued   │        │
│         │   (2/3)             │  • Running  │        │
│         │                     │  • Complete │        │
│         │                     │   (1/3)     │        │
│         └─────────────────────┴─────────────┘        │
│                                                        │
│  [Emergency Stop]         Code Preview ▼             │
└──────────────────────────────────────────────────────┘
```

### 2.3 Implement Rover Quick-Switcher

**New component:** `src/components/operator/RoverQuickSwitcher.tsx`

```tsx
export function RoverQuickSwitcher({ 
  activeConfig, 
  allConfigs, 
  onSwitch 
}: Props) {
  return (
    <Popover>
      <PopoverTrigger>
        <div className="rover-badge">
          {activeConfig.name}
          {activeConfig.roverType === 'simulator' && <SimIcon />}
          <ChevronDown />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        {allConfigs.map(config => (
          <button key={config.id} onClick={() => onSwitch(config)}>
            {config.name}
            <span className="badge">{config.roverType}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

---

## Phase 3: Visual Feed Management

### 3.1 Conditional Feed Rendering

**New component:** `src/components/operator/RoverFeedViewer.tsx`

```tsx
export function RoverFeedViewer({ roverConfig, missionId }: Props) {
  const feedType = roverConfig.visualFeedType;
  
  if (feedType === 'camera') {
    return <CameraStreamView wsUrl={getCameraWsUrl(roverConfig)} />;
  } else {
    return <SimulatorCanvasView missionId={missionId} />;
  }
}
```

### 3.2 Camera Stream Component

**File:** `src/components/operator/CameraStreamView.tsx`

- WebSocket connection to `ws://{ipAddress}:8890`
- Displays JPEG frames from Pi AI Camera
- Shows connection status badge

### 3.3 Simulator Canvas Component

**File:** `src/components/operator/SimulatorCanvasView.tsx`

- Connects to cloud simulator service
- Renders rover position, heading, wheel angles
- Can reuse logic from `roversimui.py` (PyQt simulator)
- HTML Canvas API or Three.js for 2D/3D view

**Options:**
1. **Embed PyQt simulator via iframe** (quick, reuses existing code)
2. **Port simulator to Canvas/WebGL** (better UX, more work)
3. **Server-sent image frames** (simulator generates PNGs, streams via WebSocket)

**Recommendation:** Start with option 3 (server-sent frames) for MVP.

---

## Phase 4: Ground Station Agent (GSA)

### 4.1 GSA Purpose

The Ground Station Agent is a bridge service that runs on the **Operator's network** (or on a Pi near the rover) and:
- Registers physical rovers with the cloud platform
- Proxies cloud missions to local rover hardware
- Reports rover health/status back to cloud
- Handles network interruptions gracefully

### 4.2 GSA Architecture

**New folder:** `ground-station-agent/` (can be separate repo or monorepo package)

```
ground-station-agent/
├── src/
│   ├── agent.ts              # Main entry point
│   ├── CloudClient.ts        # Connects to Firebase/Cloud API
│   ├── RoverClient.ts        # Connects to local rover (marspi.local:8523)
│   ├── HealthMonitor.ts      # Ping rover, report status
│   └── MissionPoller.ts      # Poll cloud for new missions
├── package.json
└── README.md
```

**Workflow:**
1. GSA starts → Authenticates with cloud (API key or service account)
2. Polls cloud for missions assigned to this yard/rover
3. Receives mission → Forwards instructions to local rover via HTTP
4. Subscribes to rover SSE stream → Forwards status updates to cloud
5. Mission complete → Updates cloud mission status

### 4.3 GSA Deployment Options

**Option A:** Run on Satellite Pi (mro.local)
- Co-located with camera server
- Always-on, persistent connection
- Requires Node.js/TypeScript runtime on Pi

**Option B:** Run on operator's laptop
- Temporary, session-based
- Operator starts GSA when running a session
- Easier development/testing

**Option C:** Cloud-hosted GSA with VPN/Tunnel
- Use Cloudflare Tunnel or Tailscale to reach local rover
- GSA runs in cloud, tunnels into local network
- More complex networking

**Recommendation:** Start with Option A (Satellite Pi) for production, Option B (laptop) for development.

---

## Phase 5: SSE Integration for Real-Time Updates

### 5.1 Leverage Yard SSE Architecture

The Yard system already has robust SSE streaming:
- Rover server: `GET /queue/events` (SSE endpoint)
- Satellite proxies: `GET /api/queue/events` 
- Browser EventSource → receives queue state updates

**Goal:** Cloud platform should tap into this same SSE stream via GSA.

### 5.2 GSA SSE Relay

```typescript
// ground-station-agent/src/MissionPoller.ts
export class MissionPoller {
  async monitorMission(missionId: string) {
    const eventSource = new EventSource('http://marspi.local:8523/queue/events');
    
    eventSource.onmessage = (event) => {
      const queueState = JSON.parse(event.data);
      
      // Forward to cloud
      this.cloudClient.updateMissionStatus(missionId, {
        status: queueState.current?.status || 'queued',
        currentInstruction: queueState.current,
        pending: queueState.pending,
        history: queueState.history
      });
    };
  }
}
```

### 5.3 Cloud Platform SSE Endpoint

**New file:** `src/app/api/operator/missions/[missionId]/status/route.ts`

- Receives status updates from GSA
- Stores in Firestore (`missions/{missionId}` document)
- Broadcasts to connected operators via WebSocket or Firebase Realtime Database

---

## Phase 6: UI Refinements

### 6.1 Rover Status Indicators

Add visual indicators throughout the UI:

**Queue List:**
```tsx
<div className="mission-card">
  <h3>{mission.name}</h3>
  <span className="rover-badge">
    {mission.assignedRover?.roverType === 'simulator' ? '🖥️' : '🤖'}
    {mission.assignedRover?.name || 'No rover selected'}
  </span>
</div>
```

**Execution Page:**
- Live connection status badge (Connected / Disconnected / Timeout)
- Rover type indicator
- Last command executed
- Queue position

### 6.2 Camera/Simulator Toggle

For debugging/development, allow manual override:

```tsx
<button onClick={() => setForceFeedType(feedType === 'camera' ? 'sim' : 'camera')}>
  Switch to {feedType === 'camera' ? 'Simulator' : 'Camera'}
</button>
```

### 6.3 Pre-execution Checklist

Before dispatching mission, show checklist:
- ✅ Rover selected
- ✅ Rover online (health check)
- ✅ No other mission executing
- ✅ Code validated

---

## Implementation Phases Summary

| Phase | Goal | Complexity | Time Estimate |
|-------|------|------------|---------------|
| **Phase 1** | API Unification & RoverConfig | 🟡 Medium | 2-3 days |
| **Phase 2** | Mission Execution Flow | 🟢 Low | 1-2 days |
| **Phase 3** | Visual Feed Management | 🟡 Medium | 2-3 days |
| **Phase 4** | Ground Station Agent | 🔴 High | 4-5 days |
| **Phase 5** | SSE Real-Time Updates | 🟡 Medium | 2-3 days |
| **Phase 6** | UI Refinements | 🟢 Low | 1-2 days |

**Total Estimate:** 12-18 days (2.5-3.5 weeks)

---

## Technical Decisions to Discuss

### 1. Simulator Visual Output
**Question:** How should the cloud simulator display rover movement?

**Options:**
- A) Server-side rendering → send PNG frames via WebSocket (like camera)
- B) Port PyQt simulator to HTML Canvas (more work, better UX)
- C) Use Three.js for 3D rover visualization (most immersive)

**Recommendation:** Start with A (server-side PNGs), migrate to C later.

---

### 2. GSA Deployment
**Question:** Where should the Ground Station Agent run?

**Options:**
- A) Satellite Pi (mro.local) - always-on, requires TypeScript on Pi
- B) Operator's laptop - temporary, easier dev
- C) Cloud with tunnel - complex networking

**Recommendation:** A for production, B for development.

---

### 3. Rover Assignment Strategy
**Question:** How does a mission get assigned to a rover?

**Options:**
- A) **Pre-assignment:** Operator selects rover before submitting mission
- B) **On-execution:** Mission queued globally, operator assigns rover when clicking "Run"
- C) **Auto-assignment:** System auto-assigns based on rover availability

**Recommendation:** Start with B (assign on execution page), migrate to C later.

---

### 4. Offline Resilience
**Question:** What happens if cloud platform loses connection to GSA/rover?

**Options:**
- A) **Fail immediately:** Show error, require operator intervention
- B) **Queue locally:** GSA buffers missions, syncs when reconnected
- C) **Graceful degradation:** Local Yard system continues, cloud catches up later

**Recommendation:** Start with A (fail immediately), add B (local queue) in Phase 7.

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize phases** based on MVP requirements
3. **Create GitHub issues** for each phase/task
4. **Set up development environment** for testing both repos together
5. **Start with Phase 1** (API unification)

---

## Open Questions

- [ ] Should cloud simulator support Blockly visual preview (like Yard monitor)? 
- [ ] How to handle multiple operators trying to run missions on same rover? FIRST IN
- [ ] Do we need rover reservation/locking system? YES
- [ ] Should GSA support multiple rovers (1-to-many)? YES IT CAN
- [ ] Camera stream latency requirements? DEPENDS ON THE HARDWARE
- [ ] Should execution page show live code execution line-by-line? YES LINE BY LINE

---

**Document Owner:** Integration Team  
**Last Updated:** May 14, 2026  
**Next Review:** After Phase 1 completion
