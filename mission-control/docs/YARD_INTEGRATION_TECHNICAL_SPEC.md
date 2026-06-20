# Yard Integration: Technical Specification

**Purpose:** Detailed technical specification for integrating the local Yard system with the cloud platform.

**Related Documents:**
- [YARD_INTEGRATION_PLAN.md](./YARD_INTEGRATION_PLAN.md) - High-level integration plan
- [ROVER_CONFIG_ARCHITECTURE.md](./ROVER_CONFIG_ARCHITECTURE.md) - Existing rover config system

---

## Table of Contents
1. [Phase 1: API Unification](#phase-1-api-unification)
2. [Phase 2: Execution Flow Redesign](#phase-2-execution-flow-redesign)
3. [Phase 3: Visual Feed System](#phase-3-visual-feed-system)
4. [Phase 4: Ground Station Agent](#phase-4-ground-station-agent)
5. [Database Schema Changes](#database-schema-changes)
6. [API Endpoints](#api-endpoints)

---

## Phase 1: API Unification

### 1.1 RoverConfig Schema Extension

**File:** `src/core/domain/entities/RoverConfig.ts`

```typescript
// ADD new type
export type RoverType = 'physical' | 'simulator';
export type VisualFeedType = 'camera' | 'simulator';

// UPDATE interface
export interface RoverConfig {
  // ... existing fields
  id: string;
  createdBy: string;
  name: string;
  description?: string;
  roverTag: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;

  // NEW FIELDS
  roverType: RoverType;              // 'physical' | 'simulator'
  visualFeedType: VisualFeedType;    // 'camera' | 'simulator'
  simulatorEndpoint?: string;        // Override default simulator URL
  cameraWsPort?: number;             // WebSocket port for camera (default: 8890)
}
```

### 1.2 Validation Schema Update

**File:** `src/infrastructure/validation/roverConfigValidation.ts`

```typescript
import { z } from 'zod';

export const roverTypeSchema = z.enum(['physical', 'simulator']);
export const visualFeedTypeSchema = z.enum(['camera', 'simulator']);

export const createRoverConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  roverTag: z.string().min(1).max(50),
  ipAddress: z.string().ip({ version: 'v4' }),
  port: z.number().int().min(1).max(65535),
  
  // NEW
  roverType: roverTypeSchema,
  visualFeedType: visualFeedTypeSchema,
  simulatorEndpoint: z.string().url().optional(),
  cameraWsPort: z.number().int().min(1).max(65535).optional(),
});

export const updateRoverConfigSchema = createRoverConfigSchema.partial();
```

### 1.3 Firestore Repository Update

**File:** `src/infrastructure/persistence/FirestoreRoverConfigRepository.ts`

```typescript
// UPDATE fromFirestoreDoc method
private fromFirestoreDoc(id: string, data: FirebaseFirestore.DocumentData): RoverConfig {
  return {
    // ... existing fields
    
    // ADD new fields with defaults for backward compatibility
    roverType: data.roverType || 'physical',
    visualFeedType: data.visualFeedType || 'camera',
    simulatorEndpoint: data.simulatorEndpoint,
    cameraWsPort: data.cameraWsPort || 8890,
  };
}
```

### 1.4 Unified Rover API Contract

**New file:** `src/infrastructure/rover/types.ts`

```typescript
/**
 * Unified instruction format used by both physical rovers and simulators
 * Based on Yard rover server API (yard/docs/api.md)
 */

export type InstructionCommand = 
  | 'forward'
  | 'backward'
  | 'spin_left'
  | 'spin_right'
  | 'steer_left'
  | 'steer_right'
  | 'stop'
  | 'wait'
  | 'run_python';

export interface InstructionParams {
  speed?: number;      // 0-100
  seconds?: number;    // Duration
  degrees?: number;    // 5-45 for steering
  code?: string;       // Python code for run_python
  blockly_state?: string; // Serialized Blockly workspace
}

export interface Instruction {
  cmd: InstructionCommand;
  params: InstructionParams;
}

export interface QueueAddRequest {
  instructions: Instruction[];
}

export interface QueueStatusResponse {
  current: QueueInstruction | null;
  pending: QueueInstruction[];
  history: QueueInstruction[];
  rover_connected: boolean;
}

export interface QueueInstruction {
  id: string;
  cmd: InstructionCommand;
  params: InstructionParams;
  status: 'pending' | 'executing' | 'completed' | 'error';
  timestamp: string;
  error?: string;
}
```

### 1.5 Rover HTTP Client

**File:** `src/infrastructure/rover/RoverHttpClient.ts` (UPDATE)

```typescript
import { Instruction, QueueAddRequest, QueueStatusResponse } from './types';

export class RoverHttpClient {
  constructor(private readonly baseUrl: string) {}

  /**
   * Add instructions to rover queue
   * Works for both physical rovers and simulators
   */
  async addToQueue(instructions: Instruction[]): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions } as QueueAddRequest),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
  }

  /**
   * Get current queue status
   */
  async getQueueStatus(): Promise<QueueStatusResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/queue/status`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Emergency stop - clear queue and stop rover
   */
  async emergencyStop(): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/queue/clear`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });

      return { success: response.ok };
    } catch {
      return { success: false };
    }
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 1.6 Rover Dispatch Service

**New file:** `src/infrastructure/rover/RoverDispatchService.ts`

```typescript
import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { RoverHttpClient } from './RoverHttpClient';
import { Instruction } from './types';

export interface DispatchResult {
  success: boolean;
  error?: string;
  queueId?: string;
}

export class RoverDispatchService {
  /**
   * Dispatch mission instructions to the appropriate rover (physical or simulator)
   */
  async dispatch(config: RoverConfig, instructions: Instruction[]): Promise<DispatchResult> {
    const endpoint = this.buildEndpoint(config);
    const client = new RoverHttpClient(endpoint);

    // Validate rover is reachable
    const isOnline = await client.ping();
    if (!isOnline) {
      return { 
        success: false, 
        error: `Rover ${config.name} is unreachable at ${endpoint}` 
      };
    }

    // Send instructions
    const result = await client.addToQueue(instructions);
    
    if (result.success) {
      // Update lastConnectedAt in RoverConfig
      await this.updateLastConnected(config.id);
    }

    return result;
  }

  /**
   * Build endpoint URL based on rover type
   */
  private buildEndpoint(config: RoverConfig): string {
    if (config.roverType === 'simulator') {
      return config.simulatorEndpoint || 'http://localhost:8080';
    }
    
    // Physical rover
    return `http://${config.ipAddress}:${config.port}`;
  }

  /**
   * Update lastConnectedAt timestamp
   */
  private async updateLastConnected(configId: string): Promise<void> {
    try {
      await fetch(`/api/operator/rover-configs/${configId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lastConnectedAt: new Date().toISOString() 
        }),
      });
    } catch (error) {
      console.warn('Failed to update lastConnectedAt:', error);
    }
  }
}
```

---

## Phase 2: Execution Flow Redesign

### 2.1 Remove Dual Run Buttons

**File:** `src/components/operator/QueueListScaffold.tsx`

```typescript
// BEFORE (lines 99-145 approximately)
const handleRunOnRover = async (missionId: string) => { /* ... */ }
const handleRunSimulator = (missionId: string) => { /* ... */ }

// AFTER - Replace with:
const handleOpenMission = (missionId: string) => {
  router.push(`/operator/rover/execute/${missionId}`);
}

// UPDATE button rendering (around line 300)
// REMOVE:
<button onClick={() => handleRunOnRover(mission.id)}>Run on Rover</button>
<button onClick={() => handleRunSimulator(mission.id)}>Run in Simulator</button>

// ADD:
<button 
  onClick={() => handleOpenMission(mission.id)}
  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
>
  Run
</button>
```

### 2.2 Create Mission Execution Page

**New file:** `src/app/operator/rover/execute/[missionId]/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRoverConfig } from '@/hooks/useRoverConfig';
import { Mission } from '@/core/domain/entities/Mission';
import { RoverQuickSwitcher } from '@/components/operator/RoverQuickSwitcher';
import { RoverFeedViewer } from '@/components/operator/RoverFeedViewer';
import { ExecutionStatusPanel } from '@/components/operator/ExecutionStatusPanel';
import { RoverDispatchService } from '@/infrastructure/rover/RoverDispatchService';
import toast from 'react-hot-toast';

export default function ExecuteMissionPage() {
  const params = useParams();
  const router = useRouter();
  const missionId = params.missionId as string;

  const { activeConfig, configs, setActive } = useRoverConfig();
  const [mission, setMission] = useState<Mission | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'executing' | 'completed' | 'error'>('idle');

  // Fetch mission details
  useEffect(() => {
    fetchMission();
  }, [missionId]);

  const fetchMission = async () => {
    try {
      const response = await fetch(`/api/operator/missions/${missionId}`);
      const data = await response.json();
      if (data.success) {
        setMission(data.mission);
      } else {
        toast.error('Mission not found');
        router.push('/operator');
      }
    } catch (error) {
      toast.error('Failed to load mission');
    }
  };

  const handleExecute = async () => {
    if (!activeConfig || !mission) return;

    setIsExecuting(true);
    setExecutionStatus('executing');

    try {
      // Convert mission code to instructions
      const instructions = [
        { 
          cmd: 'run_python' as const, 
          params: { code: mission.code } 
        }
      ];

      // Dispatch to rover
      const dispatcher = new RoverDispatchService();
      const result = await dispatcher.dispatch(activeConfig, instructions);

      if (result.success) {
        toast.success('Mission dispatched!');
        // Subscribe to SSE for status updates
        subscribeToExecution();
      } else {
        toast.error(result.error || 'Failed to dispatch mission');
        setExecutionStatus('error');
      }
    } catch (error) {
      toast.error('Execution failed');
      setExecutionStatus('error');
    } finally {
      setIsExecuting(false);
    }
  };

  const subscribeToExecution = () => {
    // TODO: Subscribe to SSE stream for real-time updates
    // For now, poll status
    const interval = setInterval(async () => {
      // Check if mission completed
      // Update executionStatus
    }, 2000);

    return () => clearInterval(interval);
  };

  const handleSwitchRover = async (newConfig: RoverConfig) => {
    await setActive(newConfig.id);
    toast.success(`Switched to ${newConfig.name}`);
  };

  if (!mission) {
    return <div>Loading mission...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            Execute Mission: {mission.learnerName}
          </h1>
          <p className="text-slate-400 mt-1">{mission.description}</p>
        </div>

        <button
          onClick={() => router.push('/operator')}
          className="text-slate-400 hover:text-slate-200"
        >
          ← Back to Queue
        </button>
      </div>

      {/* Rover Selection & Execute */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {activeConfig && (
              <>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Selected Rover</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-slate-50">
                      {activeConfig.name}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
                      {activeConfig.roverType}
                    </span>
                  </div>
                </div>

                <RoverQuickSwitcher
                  activeConfig={activeConfig}
                  allConfigs={configs}
                  onSwitch={handleSwitchRover}
                />
              </>
            )}
          </div>

          <button
            onClick={handleExecute}
            disabled={isExecuting || !activeConfig}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-colors"
          >
            {isExecuting ? 'Dispatching...' : 'Execute Mission'}
          </button>
        </div>
      </div>

      {/* Feed & Status */}
      <div className="grid grid-cols-3 gap-6">
        {/* Visual Feed */}
        <div className="col-span-2">
          {activeConfig && (
            <RoverFeedViewer 
              roverConfig={activeConfig} 
              missionId={missionId}
              isExecuting={executionStatus === 'executing'}
            />
          )}
        </div>

        {/* Execution Status */}
        <div>
          <ExecutionStatusPanel 
            status={executionStatus}
            mission={mission}
          />
        </div>
      </div>
    </div>
  );
}
```

### 2.3 Rover Quick Switcher Component

**New file:** `src/components/operator/RoverQuickSwitcher.tsx`

```typescript
'use client';

import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { ChevronDown, Monitor, Cpu } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';

interface Props {
  activeConfig: RoverConfig;
  allConfigs: RoverConfig[];
  onSwitch: (config: RoverConfig) => void;
}

export function RoverQuickSwitcher({ activeConfig, allConfigs, onSwitch }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors">
          <span className="text-sm text-slate-300">Switch Rover</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="bg-slate-900 rounded-lg border border-slate-700 shadow-xl p-2 min-w-[250px] z-50"
          sideOffset={5}
        >
          <div className="mb-2 px-2 py-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Available Rovers
            </p>
          </div>

          {allConfigs.map((config) => (
            <button
              key={config.id}
              onClick={() => {
                onSwitch(config);
              }}
              className={`
                w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors
                ${config.id === activeConfig.id 
                  ? 'bg-blue-600/20 border border-blue-500/50' 
                  : 'hover:bg-slate-800'
                }
              `}
            >
              <div className="flex items-center gap-2">
                {config.roverType === 'simulator' ? (
                  <Monitor className="w-4 h-4 text-blue-400" />
                ) : (
                  <Cpu className="w-4 h-4 text-green-400" />
                )}
                <span className="text-sm text-slate-50">{config.name}</span>
              </div>

              {config.id === activeConfig.id && (
                <span className="text-xs text-blue-400">✓</span>
              )}
            </button>
          ))}

          <Popover.Arrow className="fill-slate-700" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

---

## Phase 3: Visual Feed System

### 3.1 Feed Viewer Component

**New file:** `src/components/operator/RoverFeedViewer.tsx`

```typescript
'use client';

import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { CameraStreamView } from './CameraStreamView';
import { SimulatorCanvasView } from './SimulatorCanvasView';

interface Props {
  roverConfig: RoverConfig;
  missionId: string;
  isExecuting: boolean;
}

export function RoverFeedViewer({ roverConfig, missionId, isExecuting }: Props) {
  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isExecuting ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
          <h3 className="text-sm font-semibold text-slate-300">
            {roverConfig.visualFeedType === 'camera' ? 'Camera Feed' : 'Simulator View'}
          </h3>
        </div>

        <span className="text-xs text-slate-500">
          {roverConfig.name} • {roverConfig.roverType}
        </span>
      </div>

      {/* Feed Content */}
      <div className="aspect-video bg-slate-950">
        {roverConfig.visualFeedType === 'camera' ? (
          <CameraStreamView 
            ipAddress={roverConfig.ipAddress} 
            wsPort={roverConfig.cameraWsPort || 8890}
          />
        ) : (
          <SimulatorCanvasView 
            missionId={missionId}
            simulatorUrl={roverConfig.simulatorEndpoint || 'http://localhost:8080'}
          />
        )}
      </div>
    </div>
  );
}
```

### 3.2 Camera Stream Component

**New file:** `src/components/operator/CameraStreamView.tsx`

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';

interface Props {
  ipAddress: string;
  wsPort: number;
}

export function CameraStreamView({ ipAddress, wsPort }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${ipAddress}:${wsPort}`);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${msg.data}`;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [ipAddress, wsPort]);

  if (error || !isConnected) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
        <WifiOff className="w-12 h-12 mb-4" />
        <p className="text-sm">{error || 'Connecting to camera...'}</p>
        <p className="text-xs text-slate-500 mt-1">ws://{ipAddress}:{wsPort}</p>
      </div>
    );
  }

  return (
    <img 
      ref={imgRef} 
      alt="Camera feed" 
      className="w-full h-full object-contain"
    />
  );
}
```

### 3.3 Simulator Canvas Component

**New file:** `src/components/operator/SimulatorCanvasView.tsx`

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  missionId: string;
  simulatorUrl: string;
}

export function SimulatorCanvasView({ missionId, simulatorUrl }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to simulator WebSocket for frame updates
    // Simulator should send PNG/JPEG frames similar to camera
    const ws = new WebSocket(`${simulatorUrl.replace('http', 'ws')}/stream`);

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && imgRef.current) {
          imgRef.current.src = `data:image/png;base64,${msg.data}`;
        }
      } catch (err) {
        console.error('Failed to parse simulator frame:', err);
      }
    };

    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, [simulatorUrl]);

  if (!isConnected) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <p className="text-sm">Connecting to simulator...</p>
      </div>
    );
  }

  return (
    <img 
      ref={imgRef} 
      alt="Simulator view" 
      className="w-full h-full object-contain bg-slate-900"
    />
  );
}
```

---

## Phase 4: Ground Station Agent

### 4.1 GSA Project Structure

```
ground-station-agent/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuration
│   ├── CloudClient.ts        # Firebase/Cloud API client
│   ├── RoverClient.ts        # Local rover HTTP client
│   ├── HealthMonitor.ts      # Health check service
│   ├── MissionPoller.ts      # Poll cloud for missions
│   └── SSERelay.ts           # Relay rover SSE to cloud
└── README.md
```

### 4.2 GSA Configuration

**File:** `ground-station-agent/src/config.ts`

```typescript
export interface GSAConfig {
  // Cloud connection
  cloudApiUrl: string;
  cloudApiKey: string;
  yardId: string;

  // Local rover connection
  roverUrl: string;           // e.g., http://marspi.local:8523
  roverTag: string;           // Rover identifier

  // Polling
  pollIntervalMs: number;     // How often to check for new missions
  healthCheckIntervalMs: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const loadConfig = (): GSAConfig => {
  return {
    cloudApiUrl: process.env.CLOUD_API_URL || 'https://your-app.vercel.app',
    cloudApiKey: process.env.CLOUD_API_KEY || '',
    yardId: process.env.YARD_ID || 'yard-1',
    roverUrl: process.env.ROVER_URL || 'http://marspi.local:8523',
    roverTag: process.env.ROVER_TAG || 'marspi',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000', 10),
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
  };
};
```

### 4.3 Cloud Client

**File:** `ground-station-agent/src/CloudClient.ts`

```typescript
import { Mission } from './types';

export class CloudClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly yardId: string
  ) {}

  /**
   * Poll for missions assigned to this yard
   */
  async fetchPendingMissions(): Promise<Mission[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/gsa/yards/${this.yardId}/missions/pending`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch missions:', response.statusText);
        return [];
      }

      const data = await response.json();
      return data.missions || [];
    } catch (error) {
      console.error('Error fetching missions:', error);
      return [];
    }
  }

  /**
   * Update mission status
   */
  async updateMissionStatus(
    missionId: string, 
    status: string, 
    metadata?: any
  ): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/gsa/missions/${missionId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, metadata }),
      });
    } catch (error) {
      console.error('Error updating mission status:', error);
    }
  }

  /**
   * Report rover health
   */
  async reportRoverHealth(roverTag: string, isOnline: boolean): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/gsa/rovers/${roverTag}/health`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          isOnline, 
          timestamp: new Date().toISOString() 
        }),
      });
    } catch (error) {
      console.error('Error reporting health:', error);
    }
  }
}
```

### 4.4 Rover Client

**File:** `ground-station-agent/src/RoverClient.ts`

```typescript
export class RoverClient {
  constructor(private readonly roverUrl: string) {}

  async addToQueue(instructions: any[]): Promise<boolean> {
    try {
      const response = await fetch(`${this.roverUrl}/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error adding to queue:', error);
      return false;
    }
  }

  async getQueueStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.roverUrl}/queue/status`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching queue status:', error);
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.roverUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 4.5 Main Agent Loop

**File:** `ground-station-agent/src/index.ts`

```typescript
import { loadConfig } from './config';
import { CloudClient } from './CloudClient';
import { RoverClient } from './RoverClient';
import { HealthMonitor } from './HealthMonitor';
import { MissionPoller } from './MissionPoller';

async function main() {
  const config = loadConfig();

  console.log('🚀 Starting Ground Station Agent');
  console.log(`Yard: ${config.yardId}`);
  console.log(`Rover: ${config.roverTag} @ ${config.roverUrl}`);
  console.log(`Cloud: ${config.cloudApiUrl}`);

  const cloudClient = new CloudClient(
    config.cloudApiUrl,
    config.cloudApiKey,
    config.yardId
  );

  const roverClient = new RoverClient(config.roverUrl);

  // Health monitoring
  const healthMonitor = new HealthMonitor(cloudClient, roverClient, config);
  healthMonitor.start();

  // Mission polling
  const missionPoller = new MissionPoller(cloudClient, roverClient, config);
  missionPoller.start();

  console.log('✅ Ground Station Agent is running');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    healthMonitor.stop();
    missionPoller.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
```

---

## Database Schema Changes

### Firestore Collections

#### `rover-configs` (UPDATE)
```typescript
{
  id: string;
  createdBy: string;
  name: string;
  roverTag: string;
  ipAddress: string;
  port: number;
  
  // NEW
  roverType: 'physical' | 'simulator';
  visualFeedType: 'camera' | 'simulator';
  simulatorEndpoint?: string;
  cameraWsPort?: number;
  
  // Existing
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}
```

#### `missions` (UPDATE)
```typescript
{
  id: string;
  yardId: string;
  learnerName: string;
  code: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  
  // NEW
  assignedRoverId?: string;       // RoverConfig ID
  dispatchedAt?: string;          // When GSA picked up mission
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executionLog?: {                // Real-time execution state
    currentInstruction?: any;
    pending: any[];
    history: any[];
  };
  
  // Existing
  createdAt: string;
  completedAt?: string;
}
```

---

## API Endpoints

### New GSA Endpoints

#### `GET /api/gsa/yards/{yardId}/missions/pending`
Returns missions assigned to yard that are ready for execution.

#### `PATCH /api/gsa/missions/{missionId}/status`
Update mission status from GSA.

#### `POST /api/gsa/rovers/{roverTag}/health`
Report rover online/offline status.

---

**Next Steps:** Review this spec, prioritize phases, and begin implementation.
