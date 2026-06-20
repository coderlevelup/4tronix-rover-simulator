# API Changes Summary

**Date:** May 14, 2026  
**Status:** ✅ Completed  
**Branch:** `Yard_Mode_Setup`

## Overview

This document summarizes all API changes made to implement Yard Mode integration with API versioning and rover type identification, as recommended by sponsors and Gemini AI.

---

## 1. ✅ API Harmonization

### Goal
Ensure physical Pi Zero rovers and cloud simulators use **identical API payloads** to prevent technical divergence.

### Implementation

#### Before (Divergent APIs)
```typescript
// Physical Rover
POST http://marspi.local:8523/queue/add
[{ cmd: 'run_python', params: { code, id } }]

// Simulator (Different!)
POST http://localhost:8080/api/execute
{ code: "..." }
```

#### After (Unified API)
```typescript
// Both Physical & Simulator
POST /queue/add
[{ 
  apiVersion: 'v1',
  cmd: 'run_python', 
  params: { code, id } 
}]
```

### Changes Made
- ✅ Added `/queue/add` endpoint to simulator ([simulator_api.py](../simulator-service/simulator_api.py))
- ✅ Added `/queue/clear` endpoint to simulator for emergency stop
- ✅ Removed fallback logic from [RoverHttpClient.ts](../src/infrastructure/rover/RoverHttpClient.ts)
- ✅ Both systems now return identical `RoverQueueResponse` format

---

## 2. ✅ API Versioning

### Goal
Include `apiVersion: 'v1'` in all payloads to dynamically handle different rover software versions without breaking changes.

### Implementation

#### Updated Types
**File:** [src/infrastructure/rover/types/RoverPayload.ts](../src/infrastructure/rover/types/RoverPayload.ts)

```typescript
export type RoverApiVersion = 'v1';

export interface RoverMissionPayload {
  apiVersion: RoverApiVersion;  // NEW
  cmd: 'run_python';
  params: {
    code: string;
    id: string;
  };
}
```

#### Version Validation
**Simulator:** [simulator_api.py](../simulator-service/simulator_api.py)
```python
SUPPORTED_API_VERSIONS = ['v1']

# Validate incoming version
api_version = instruction.get('apiVersion', 'v1')
if api_version not in SUPPORTED_API_VERSIONS:
    return {
        'apiVersion': 'v1',
        'status': 'error',
        'unsupportedVersion': True,
        'error': f'Unsupported API version: {api_version}'
    }
```

#### Client Handling
**File:** [RoverHttpClient.ts](../src/infrastructure/rover/RoverHttpClient.ts)
```typescript
// Check for version mismatch
if (data.unsupportedVersion) {
  console.warn('Rover reported unsupported API version');
}

if (data.apiVersion && data.apiVersion !== apiVersion) {
  console.warn(`Version mismatch: sent ${apiVersion}, got ${data.apiVersion}`);
}
```

### Benefits
- ✅ Future-proof: Can introduce v2, v3 without breaking existing rovers
- ✅ Detects version mismatches between mission control and rover software
- ✅ Backward compatible: Defaults to 'v1' if version missing

---

## 3. ✅ Rover Type Identification

### Goal
Prevent accidental code execution on wrong hardware by clearly identifying Physical vs Simulator rovers.

### Implementation

#### Updated RoverConfig Entity
**File:** [src/core/domain/entities/RoverConfig.ts](../src/core/domain/entities/RoverConfig.ts)

```typescript
export type RoverType = 'physical' | 'simulator';
export type VisualFeedType = 'camera' | 'simulator';

export interface RoverConfig {
  // ... existing fields
  
  // NEW: Rover identification
  roverType: RoverType;
  visualFeedType: VisualFeedType;
  cameraWsPort?: number;        // For physical rovers
  simulatorEndpoint?: string;   // For simulators
}
```

#### Visual Indicators
**File:** [src/lib/rover-type-utils.tsx](../src/lib/rover-type-utils.tsx)

```tsx
// Consistent badges across UI
<RoverTypeBadge type="physical" />  // 🤖 Physical
<RoverTypeBadge type="simulator" /> // 🖥️ Simulator
```

**Updated Components:**
- ✅ [RoverConfigCard.tsx](../src/components/rover-config/RoverConfigCard.tsx) - Shows type badge
- ✅ [RoverConfigForm.tsx](../src/components/rover-config/RoverConfigForm.tsx) - Tag field required

#### Validation
**File:** [src/infrastructure/validation/roverConfigValidation.ts](../src/infrastructure/validation/roverConfigValidation.ts)

```typescript
export const createRoverConfigSchema = z.object({
  // ... existing fields
  roverType: z.enum(['physical', 'simulator']),
  visualFeedType: z.enum(['camera', 'simulator']),
  cameraWsPort: z.number().int().min(1).max(65535).optional(),
  simulatorEndpoint: z.string().url().optional(),
});
```

#### Repository Updates
**File:** [FirestoreRoverConfigRepository.ts](../src/infrastructure/persistence/FirestoreRoverConfigRepository.ts)

```typescript
private fromFirestoreDoc(id: string, data: Record<string, any>): RoverConfig {
  return {
    // ... existing fields
    roverType: data.roverType || 'physical', // Backward compatible
    visualFeedType: data.visualFeedType || 
      (data.roverType === 'simulator' ? 'simulator' : 'camera'),
    cameraWsPort: data.cameraWsPort,
    simulatorEndpoint: data.simulatorEndpoint,
  };
}
```

### Benefits
- ✅ Operators see clear visual indicators (🤖 Physical vs 🖥️ Simulator)
- ✅ Prevents accidental hardware/simulator confusion
- ✅ Required tag field enforces proper labeling
- ✅ Backward compatible with existing configs

---

## 4. ✅ Emergency Stop API

### Goal
Unified emergency stop using `/queue/clear` endpoint for both physical rovers and simulators.

### Implementation

**File:** [src/app/api/operator/rover/emergency-stop/route.ts](../src/app/api/operator/rover/emergency-stop/route.ts)

```typescript
// Get active rover config
const activeConfig = await roverConfigRepository.findActiveByUserId(userId);

// Send to rover's /queue/clear endpoint
const roverUrl = `http://${activeConfig.ipAddress}:${activeConfig.port}/queue/clear`;
await fetch(roverUrl, { method: 'POST' });

// Update mission status
await missionRepository.update(missionId, {
  status: 'cancelled',
  executionResult: {
    isSuccessful: false,
    errorMessage: 'Emergency stop triggered by operator',
  },
});
```

### Benefits
- ✅ Uses active rover configuration
- ✅ Works with both physical and simulator
- ✅ Updates mission status in Firestore
- ✅ Gracefully handles network failures

---

## 5. ✅ API Documentation

### Created Documentation

1. **Markdown Guide:** [docs/ROVER_API_V1.md](./ROVER_API_V1.md)
   - Complete API reference
   - Request/response examples
   - Error handling guide
   - Integration examples (TypeScript & Python)
   - Migration guide from legacy API

2. **OpenAPI Spec:** [docs/openapi-rover-v1.yaml](./openapi-rover-v1.yaml)
   - Machine-readable API specification
   - Can be imported into Postman, Swagger UI, etc.
   - Includes all endpoints, schemas, examples
   - Ready for API documentation generators

### Documentation Highlights
- ✅ Complete endpoint documentation
- ✅ Request/response schemas with examples
- ✅ Error scenarios and status codes
- ✅ Python code constraints and security restrictions
- ✅ Rover type identification guide
- ✅ Future version roadmap (v2)

---

## Summary of Files Changed

### Core Infrastructure
- ✅ `src/infrastructure/rover/types/RoverPayload.ts` - Added apiVersion
- ✅ `src/infrastructure/rover/RoverHttpClient.ts` - Removed fallback, added version logging
- ✅ `src/core/domain/entities/RoverConfig.ts` - Added roverType, visualFeedType
- ✅ `src/infrastructure/validation/roverConfigValidation.ts` - Updated schema
- ✅ `src/infrastructure/persistence/FirestoreRoverConfigRepository.ts` - Handle new fields

### API Endpoints
- ✅ `simulator-service/simulator_api.py` - Added /queue/add, /queue/clear, version validation
- ✅ `src/app/api/operator/rover/emergency-stop/route.ts` - Complete rewrite

### UI Components
- ✅ `src/lib/rover-type-utils.tsx` - NEW: Badge utilities
- ✅ `src/components/rover-config/RoverConfigCard.tsx` - Shows rover type badge

### Documentation
- ✅ `docs/ROVER_API_V1.md` - NEW: Complete API guide
- ✅ `docs/openapi-rover-v1.yaml` - NEW: OpenAPI 3.0 spec
- ✅ `docs/API_CHANGES_SUMMARY.md` - NEW: This document

---

## Testing Checklist

### ✅ Simulator API
- [x] `/queue/add` accepts v1 payloads
- [x] Rejects unsupported API versions
- [x] Returns apiVersion in response
- [x] `/queue/clear` returns success
- [x] Code validation works

### ✅ Rover Configuration
- [x] New configs require roverType and visualFeedType
- [x] Existing configs default to 'physical'
- [x] Badges show in RoverConfigCard
- [x] Form validation enforces required fields

### ✅ Emergency Stop
- [x] Uses active rover config
- [x] Sends to /queue/clear endpoint
- [x] Updates mission status
- [x] Handles network errors gracefully

---

## Next Steps

### Phase 1 Complete ✅
- [x] API harmonization
- [x] API versioning
- [x] Rover type identification
- [x] Documentation

### Phase 2 (Next Sprint)
- [ ] Build execution page UI with rover switcher
- [ ] Add camera stream components
- [ ] Add simulator canvas components
- [ ] Test end-to-end flow

### Phase 3 (Future)
- [ ] Ground Station Agent (GSA) for cloud-to-local bridge
- [ ] Real-time execution status via SSE
- [ ] API v2 with enhanced features

---

## Sponsor Requirements ✅

All sponsor requirements have been addressed:

1. **✅ API Harmonization**: Physical and simulator use identical `/queue/add` API
2. **✅ API Versioning**: `apiVersion: 'v1'` included in all payloads
3. **✅ Rover Tagging**: Required tag field with visual indicators (🤖/🖥️)
4. **✅ Documentation**: Complete API docs (markdown + OpenAPI spec)

---

**Document Owner:** Integration Team  
**Last Updated:** May 14, 2026  
**Status:** Ready for Review
