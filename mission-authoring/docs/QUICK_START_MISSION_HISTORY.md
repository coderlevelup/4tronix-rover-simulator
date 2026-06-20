# Mission History Quick Start Guide

Quick reference for using the Mission History feature with the flattened data model.

## For Learners (Frontend)

### Viewing Mission History

Navigate to `/history` page. Missions automatically update in real-time via Firestore `onSnapshot` listener.

### Submitting a Mission with History Tracking

```typescript
import { useMissionSubmit } from '@/hooks/useMissionSubmit';
import { getLearnerID } from '@/lib/getLearnerID';

function MyComponent() {
  const { submitMission, isSubmitting, error } = useMissionSubmit();

  const handleSubmit = async () => {
    const result = await submitMission({
      code: 'rover.forward(100)',
      yardId: 'uct-rover-1',
      learnerId: getLearnerID(),
      sessionId: getLearnerID(),
      challengeId: 'M1-FORWARD',
      missionName: 'My First Mission',
    });

    if (result.success) {
      console.log('Mission submitted:', result.missionId);
      // Redirect to history page
      router.push('/history');
    } else {
      console.error('Submission failed:', result.error);
    }
  };

  return (
    <button onClick={handleSubmit} disabled={isSubmitting}>
      {isSubmitting ? 'Submitting...' : 'Submit Mission'}
    </button>
  );
}
```

## For Operators

### Direct Firestore Update (Recommended)

```typescript
import { doc, updateDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';

const db = getFirestoreClient();

// When starting execution
await updateDoc(doc(db, 'missions', missionId), {
  status: 'processing',
  startedAt: new Date().toISOString(),
});

// When finished with video
await updateDoc(doc(db, 'missions', missionId), {
  status: 'completed',
  completedAt: new Date().toISOString(),
  youtubeUrl: 'https://www.youtube.com/watch?v=ABC123',
});
```

### Via API Endpoint

```typescript
// POST /api/operator/missions/[missionId]/complete
const response = await fetch('/api/operator/missions/abc123/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    youtubeUrl: 'https://youtube.com/watch?v=ABC123',
    completedAt: new Date().toISOString(),
  }),
});
```

## Mission Status Values

| Status | When | Visible To Learner |
|--------|------|-------------------|
| `submitted` | Learner submits mission | "Waiting for operator execution" |
| `in-progress` | Operator starts execution | "Being executed on rover" |
| `completed` | Operator finishes + adds video | Video player + execution notes |

## Data Structure

```typescript
interface LearnerMission {
  missionId: string;
  missionName?: string;
  status: 'submitted' | 'in-progress' | 'completed';
  submittedAt: string;              // ISO timestamp
  completedAt?: string;             // ISO timestamp
  youtubeVideoLink?: string;        // Full YouTube URL
  executionNotes?: string;          // Operator feedback
  code?: string;
  yardId?: string;
  challengeId?: string;
}
```

## Firestore Paths

```
learners/{learnerId}/missions/{missionId}
```

Example:
```
learners/abc123xyz/missions/mission-001/
  ├─ missionId: "mission-001"
  ├─ status: "completed"
  ├─ submittedAt: "2026-04-24T10:00:00Z"
  ├─ completedAt: "2026-04-24T10:05:00Z"
  ├─ youtubeVideoLink: "https://youtube.com/watch?v=..."
  └─ executionNotes: "Great work!"
```

## Real-Time Updates

The `/history` page automatically subscribes to mission updates:

```typescript
// This happens automatically in MissionHistoryScaffold
const unsubscribe = subscribeLearnerMissions(learnerId, (missions) => {
  // UI updates instantly when operator changes status
  setMissions(missions);
});
```

## Testing Locally

1. Submit a mission as a learner
2. Open Firestore console
3. Navigate to: `learners/{learnerId}/missions/{missionId}`
4. Manually update `status` to `"in-progress"`
5. Watch the UI update instantly
6. Add `youtubeVideoLink` field
7. Watch video appear instantly

## Common Patterns

### Get Learner ID
```typescript
import { getLearnerID } from '@/lib/getLearnerID';
const learnerId = getLearnerID(); // Returns or creates ID
```

### Check if YouTube URL is Valid
```typescript
import { isValidYouTubeUrl } from '@/lib/services/operatorMissionService';

if (!isValidYouTubeUrl(url)) {
  alert('Invalid YouTube URL');
}
```

### Save Mission Manually
```typescript
import { saveLearnerMission } from '@/lib/services/learnerMissionService';

await saveLearnerMission(learnerId, {
  missionId: 'mission-001',
  status: 'submitted',
  submittedAt: new Date().toISOString(),
  code: 'rover.forward(100)',
});
```

## Error Handling

```typescript
try {
  await completeMission(learnerId, missionId, youtubeUrl, notes);
} catch (error) {
  console.error('Failed to complete mission:', error);
  // Show error to operator
}
```

## See Also

- [Full Operator Guide](./OPERATOR_MISSION_UPDATE.md)
- [Complete Update Summary](./MISSION_HISTORY_UPDATE_SUMMARY.md)
- [MissionHistoryScaffold Component](../src/components/mission/MissionHistoryScaffold.tsx)
