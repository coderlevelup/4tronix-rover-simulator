# Operator Mission Update Guide

This guide explains how operators can update missions after execution to provide feedback and video links.

## Overview

Missions are stored in a single collection: `missions/{missionId}` with a `learnerId` field.

This unified storage enables:
- Real-time updates that appear instantly in the learner's Mission History page
- Direct access to missions by `learnerId`
- Simplified data model with no subcollections

## Mission Status Flow

```
queued → processing → completed
```

- **queued**: Mission is waiting in the operator's queue
- **processing**: Operator has started execution on rover
- **completed**: Execution finished, video and YouTube link added
- **failed**: Execution encountered an error
- **cancelled**: Mission was cancelled

## Updating Mission Status

### Method 1: Direct Firestore Update (Recommended)

```typescript
import { doc, updateDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';

const db = getFirestoreClient();
const missionRef = doc(db, 'missions', missionId);

// When starting execution
await updateDoc(missionRef, {
  status: 'processing',
  startedAt: new Date().toISOString(),
});

// When execution completes
await updateDoc(missionRef, {
  status: 'completed',
  completedAt: new Date().toISOString(),
  youtubeUrl: 'https://www.youtube.com/watch?v=VIDEO_ID',
});
```

## Required Fields for Completion

When marking a mission as **completed**, include:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | ✅ Yes | Set to `"completed"` |
| `completedAt` | string (ISO) | ✅ Yes | Timestamp when execution finished |
| `youtubeUrl` | string | ⚠️ Recommended | YouTube video URL for playback |
| `startedAt` | string (ISO) | ⚠️ Recommended | Timestamp when execution started |

## YouTube Video Link Format

Accepted formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

The video will be automatically embedded in the learner's Mission History page.

## Example: Complete Operator Flow

```typescript
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';

// 1. Operator receives mission from queue
const mission = await getNextMissionFromQueue();
const missionId = mission.id;

// 2. Mark as processing
const db = getFirestoreClient();
const missionRef = doc(db, 'missions', missionId);

await updateDoc(missionRef, {
  status: 'processing',
  startedAt: new Date().toISOString(),
});

// 3. Execute mission on rover
const executionResult = await executeOnRover(mission.code);

// 4. Upload video to YouTube
const youtubeLink = await uploadToYouTube(executionResult.videoFile);

// 5. Mark as completed with video link
await updateDoc(missionRef, {
  status: 'completed',
  completedAt: new Date().toISOString(),
  youtubeUrl: youtubeLink,
  executionResult: {
    isSuccessful: executionResult.success,
    consoleOutput: executionResult.output,
    errorMessage: executionResult.error,
  },
});
```

## Real-Time Updates

The learner's Mission History page uses Firestore `onSnapshot` listeners on the missions collection. Updates appear **instantly** without page refresh:

1. Learner sees "Waiting in queue for operator execution"
2. Operator updates status to `processing`
3. Learner sees "Being executed on rover" (instant update)
4. Operator completes and adds video link
5. Learner sees video (instant update)

## Finding the Mission

All missions have a `learnerId` field that identifies which learner submitted it:

```typescript
// Get a mission by ID
const missionDoc = await getDoc(doc(db, 'missions', missionId));
const mission = missionDoc.data();

// The mission has a learnerId field for reference
console.log(mission.learnerId); // Unique learner identifier
```

## Data Integrity

**Important**: Never overwrite the entire mission document. Always use `updateDoc` with partial updates to preserve existing data:

```typescript
// ✅ GOOD: Partial update
await updateDoc(missionRef, {
  status: 'completed',
  youtubeUrl: 'https://youtube.com/watch?v=...',
});

// ❌ BAD: Overwrites entire document
await setDoc(missionRef, {
  status: 'completed',
  youtubeUrl: 'https://youtube.com/watch?v=...',
});
```

## Troubleshooting

### Mission not appearing in learner history

1. Verify the mission was saved to `missions/{missionId}` with correct `learnerId`
2. Check that the mission's `learnerId` matches the learner's localStorage ID
3. Ensure Firestore rules allow read/write access
4. Verify Firestore index exists for: `missions(learnerId ASC, submittedAt DESC)`

### Video not displaying

1. Verify YouTube URL format is correct
2. Check that video is public or unlisted (not private)
3. Ensure `youtubeUrl` field name is spelled correctly (not `youtubeVideoLink`)
4. Check browser console for player errors

### Real-time updates not working

1. Verify Firestore onSnapshot listener is active on missions collection
2. Check browser console for Firestore errors
3. Ensure learner is on the `/history` page
4. Verify mission has `learnerId` field matching current learner

## API Integration

For automated operator systems, create an API endpoint:

```typescript
// app/api/operator/missions/[missionId]/complete/route.ts
import { doc, updateDoc } from 'firebase/firestore';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { missionId: string } }
) {
  const { youtubeUrl, startedAt, completedAt } = await request.json();
  const db = getFirestoreInstance();

  const missionRef = doc(db, 'missions', params.missionId);

  await updateDoc(missionRef, {
    status: 'completed',
    youtubeUrl,
    startedAt,
    completedAt: completedAt || new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
```

## Security Considerations

- Operators should validate YouTube URLs before saving
- Only authorized operators should be able to update missions
- Validate `status` field is one of: queued, processing, completed, failed, cancelled
- Consider adding operator identity tracking in execution result

## Deprecated

The `learnerMissionService` and learner subcollection pattern (`learners/{learnerId}/missions/{missionId}`) are deprecated. Use direct mission updates instead.
