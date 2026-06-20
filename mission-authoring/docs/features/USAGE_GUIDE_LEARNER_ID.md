# Usage Guide: getLearnerID() Utility

## Quick Start

The `getLearnerID()` utility provides automatic learner identification without requiring email or password.

### Basic Usage

```typescript
import { getLearnerID } from '@/lib/getLearnerID';

// Get or generate learner ID (automatically persists in localStorage)
const learnerId = getLearnerID();
console.log('Learner ID:', learnerId);
```

### React Hook

```tsx
import { useLearnerID } from '@/hooks/useLearnerID';

export function MyComponent() {
  const { learnerId, learnerData, loading } = useLearnerID();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <p>Your ID: {learnerId}</p>
      <p>Missions Completed: {learnerData?.missionsCompleted}</p>
      <p>Progress: {learnerData?.progress}%</p>
    </div>
  );
}
```

## How It Works

### 1. First Visit (New Learner)

```typescript
// User visits site for first time
const learnerId = getLearnerID();
// → Generates: "xT4pQ9kLmN2rV8wY3zB5e" (21 chars, collision-resistant)
// → Stores in localStorage: 'mars-rover-learner-id'
// → Creates Firestore document: learners/xT4pQ9kLmN2rV8wY3zB5e
```

**Firestore Document Created:**
```json
{
  "learnerId": "xT4pQ9kLmN2rV8wY3zB5e",
  "createdAt": "2026-04-24T14:30:00Z",
  "missionsCompleted": 0,
  "progress": 0,
  "lastActiveAt": "2026-04-24T14:30:00Z"
}
```

### 2. Return Visit (Existing Learner)

```typescript
// User returns to site
const learnerId = getLearnerID();
// → Retrieves from localStorage: "xT4pQ9kLmN2rV8wY3zB5e"
// → Updates Firestore: lastActiveAt timestamp
// → Returns existing ID (no new ID generated)
```

### 3. Cache Cleared (Generate New ID)

```typescript
// User clears browser cache/localStorage
const learnerId = getLearnerID();
// → localStorage empty, generates NEW ID
// → Creates NEW Firestore document
// → New learner session begins
```

## API Reference

### `getLearnerID(): string`

Gets or creates a unique learner ID.

**Returns:** Learner ID (21 character string)

**Behavior:**
- ✅ Checks localStorage first
- ✅ Reuses existing ID if found
- ✅ Generates new ID if not found
- ✅ Stores in localStorage automatically

**Example:**
```typescript
const id = getLearnerID();
// "xT4pQ9kLmN2rV8wY3zB5e"
```

### `clearLearnerID(): void`

Clears the stored learner ID (useful for testing or reset).

**Example:**
```typescript
clearLearnerID();
// localStorage cleared
// Next call to getLearnerID() generates new ID
```

### `hasLearnerID(): boolean`

Checks if a learner ID exists in storage.

**Returns:** `true` if ID exists, `false` otherwise

**Example:**
```typescript
if (hasLearnerID()) {
  console.log('Returning user');
} else {
  console.log('New user');
}
```

### `initializeLearner(): Promise<LearnerRecord>`

Initializes learner in Firestore (auto-creates document if needed).

**Returns:** Promise resolving to `LearnerRecord`

**Example:**
```typescript
import { initializeLearner } from '@/lib/initializeLearner';

const learner = await initializeLearner();
console.log('Missions:', learner.missionsCompleted);
```

### `incrementMissionsCompleted(learnerId: string): Promise<void>`

Increments the learner's completed missions count.

**Example:**
```typescript
import { incrementMissionsCompleted } from '@/lib/initializeLearner';

await incrementMissionsCompleted(learnerId);
```

### `updateProgress(learnerId: string, progress: number): Promise<void>`

Updates learner's progress (0-100).

**Example:**
```typescript
import { updateProgress } from '@/lib/initializeLearner';

await updateProgress(learnerId, 75); // 75% complete
```

## Integration Examples

### Mission Submission

```typescript
import { getLearnerID } from '@/lib/getLearnerID';
import { incrementMissionsCompleted } from '@/lib/initializeLearner';

// When submitting a mission
async function submitMission(code: string) {
  const learnerId = getLearnerID();

  const response = await fetch('/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      learnerId,
      code,
      yardId: 'uct-rover-1',
    }),
  });

  const { missionId } = await response.json();
  return missionId;
}

// When mission completes
async function onMissionComplete(learnerId: string) {
  await incrementMissionsCompleted(learnerId);
}
```

### Progress Tracking

```typescript
import { getLearnerID } from '@/lib/getLearnerID';
import { updateProgress } from '@/lib/initializeLearner';

// Update progress when learner completes a challenge
async function completeChallenge(challengeNumber: number, totalChallenges: number) {
  const learnerId = getLearnerID();
  const progress = Math.round((challengeNumber / totalChallenges) * 100);

  await updateProgress(learnerId, progress);
}
```

### React Component

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getLearnerID } from '@/lib/getLearnerID';
import { initializeLearner, LearnerRecord } from '@/lib/initializeLearner';

export function LearnerProfile() {
  const [learner, setLearner] = useState<LearnerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const record = await initializeLearner();
      setLearner(record);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!learner) return <div>Error loading profile</div>;

  return (
    <div className="profile-card">
      <h2>Your Progress</h2>
      <p>ID: {learner.learnerId}</p>
      <p>Missions Completed: {learner.missionsCompleted}</p>
      <p>Progress: {learner.progress}%</p>
      <p>Member Since: {new Date(learner.createdAt).toLocaleDateString()}</p>
    </div>
  );
}
```

### API Route (Mission Submission)

```typescript
// src/app/api/missions/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { learnerId, code, yardId } = await request.json();

  // Validate learner ID
  if (!learnerId || learnerId.length !== 21) {
    return NextResponse.json(
      { error: 'Valid learner ID required' },
      { status: 400 }
    );
  }

  // Create mission with learner ID
  const mission = {
    id: nanoid(),
    learnerId, // Associate with learner
    code,
    yardId,
    status: 'queued',
    submittedAt: new Date().toISOString(),
  };

  // Save to Firestore
  await missionRepo.create(mission);

  return NextResponse.json({ missionId: mission.id });
}
```

## Firestore Structure

### Collection: `learners/{learnerId}`

```typescript
interface LearnerDocument {
  learnerId: string;           // Unique ID (nanoid)
  createdAt: Timestamp;        // When learner was created
  missionsCompleted: number;   // Total missions completed
  progress: number;            // Progress percentage (0-100)
  lastActiveAt: Timestamp;     // Last activity timestamp
}
```

### Firestore Queries

```typescript
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

// Get learner by ID
const learnerRef = doc(db, 'learners', learnerId);
const learnerSnap = await getDoc(learnerRef);

// Get top learners by missions completed
const q = query(
  collection(db, 'learners'),
  orderBy('missionsCompleted', 'desc'),
  limit(10)
);
const snapshot = await getDocs(q);

// Get active learners (last 7 days)
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 7);

const activeQuery = query(
  collection(db, 'learners'),
  where('lastActiveAt', '>=', cutoff)
);
```

## Security Rules

Add to `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /learners/{learnerId} {
      // Anyone can read learner profiles (no PII)
      allow read: if true;
      
      // Anyone can create new learner
      allow create: if request.resource.data.learnerId == learnerId;
      
      // Prevent manual tampering with mission counts
      allow update: if request.resource.data.missionsCompleted >= resource.data.missionsCompleted;
    }
  }
}
```

## Testing

### Unit Tests

```bash
npm test getLearnerID
```

### Manual Testing

1. **First Visit**
   ```typescript
   // Open browser console
   import { getLearnerID } from '@/lib/getLearnerID';
   
   const id = getLearnerID();
   console.log('Generated:', id);
   
   // Check localStorage
   console.log('Stored:', localStorage.getItem('mars-rover-learner-id'));
   ```

2. **Persistence Test**
   ```typescript
   // Reload page
   const id = getLearnerID();
   console.log('Same ID after reload:', id);
   ```

3. **Clear and Regenerate**
   ```typescript
   import { clearLearnerID, getLearnerID } from '@/lib/getLearnerID';
   
   clearLearnerID();
   const newId = getLearnerID();
   console.log('New ID after clear:', newId);
   ```

## Common Patterns

### Pattern 1: On App Startup

```typescript
// src/app/layout.tsx
'use client';

import { useEffect } from 'react';
import { initializeLearner } from '@/lib/initializeLearner';

export default function RootLayout({ children }) {
  useEffect(() => {
    // Initialize learner on app startup
    initializeLearner().catch(console.error);
  }, []);

  return <html>{children}</html>;
}
```

### Pattern 2: Protected Action

```typescript
// Require learner ID before action
import { hasLearnerID, getLearnerID } from '@/lib/getLearnerID';

function submitMission() {
  if (!hasLearnerID()) {
    alert('Initializing your session...');
    getLearnerID(); // Generate ID
  }

  const learnerId = getLearnerID();
  // Proceed with submission
}
```

### Pattern 3: Analytics

```typescript
// Track learner activity
import { getLearnerID } from '@/lib/getLearnerID';

function trackEvent(eventName: string) {
  const learnerId = getLearnerID();

  // Send to analytics
  analytics.track(eventName, {
    learnerId, // Anonymous ID (no PII)
    timestamp: new Date().toISOString(),
  });
}
```

## Troubleshooting

### Issue: ID Not Persisting

**Cause**: localStorage disabled or private browsing mode

**Solution**:
```typescript
import { getLearnerID } from '@/lib/getLearnerID';

try {
  const id = getLearnerID();
} catch (error) {
  console.warn('localStorage not available, using session-only ID');
  // Fallback to in-memory session ID
}
```

### Issue: Firestore Permission Denied

**Cause**: Security rules not configured

**Solution**: Update Firestore rules to allow learner document creation

### Issue: Multiple IDs Generated

**Cause**: clearLearnerID() called repeatedly

**Solution**: Only call clearLearnerID() for testing or explicit reset

## Best Practices

✅ **Do:**
- Call `getLearnerID()` on every mission submission
- Store learner ID with each mission record
- Use `initializeLearner()` on app startup
- Increment counters after mission completion

❌ **Don't:**
- Manually create learner IDs (always use utility)
- Store PII with learner records
- Call clearLearnerID() in production code
- Assume localStorage always available

## Migration from Existing System

If you have existing mission records without learner IDs:

```typescript
// Migration script (run once)
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { nanoid } from 'nanoid';

async function migrateMissions() {
  const missionsRef = collection(db, 'missions');
  const snapshot = await getDocs(missionsRef);

  for (const mission of snapshot.docs) {
    if (!mission.data().learnerId) {
      await updateDoc(doc(db, 'missions', mission.id), {
        learnerId: nanoid(21), // Assign anonymous ID
      });
    }
  }
}
```

## Related Documentation

- Main System Docs: `ANONYMOUS_LEARNER_SYSTEM.md`
- Migration Guide: `MIGRATION_GUIDE_ANONYMOUS_LEARNERS.md`
- Implementation Summary: `ANONYMOUS_LEARNER_IMPLEMENTATION_SUMMARY.md`

## Support

For questions:
- Check unit tests for examples: `src/__tests__/unit/getLearnerID.test.ts`
- Review implementation: `src/lib/getLearnerID.ts`
- See React hook: `src/hooks/useLearnerID.ts`
