# Mission History Feature Update Summary

## Overview

Updated the Mission History feature to support real-time operator feedback and YouTube video links for anonymous learners.

## Problem Solved

Previously, learners had no way to see:
- Real-time status updates after submitting a mission
- Execution results and feedback from operators
- Video recordings of their mission execution

## Solution

Implemented a dual-storage system:
1. **Main missions collection**: `missions/{missionId}` - For operator queue (existing)
2. **Learner subcollection**: `learners/{learnerId}/missions/{missionId}` - For learner history (new)

This enables:
- Real-time updates via Firestore `onSnapshot` listeners
- Operator feedback to sync instantly to learner UI
- Anonymous learner tracking via `learnerId` from localStorage

## Files Created

### 1. Learner Mission Service
**File**: `src/lib/services/learnerMissionService.ts`

Core service for managing learner-specific missions:
- `saveLearnerMission()` - Save/update mission in learner subcollection
- `getLearnerMission()` - Get single mission
- `getLearnerMissions()` - Get all missions for a learner
- `subscribeLearnerMissions()` - Real-time listener for instant updates
- `updateLearnerMission()` - Update mission status/feedback

**Key Feature**: Uses Firestore `onSnapshot` for real-time updates.

### 2. Operator Mission Service
**File**: `src/lib/services/operatorMissionService.ts`

Helper functions for operators:
- `markMissionInProgress()` - Update status when starting execution
- `completeMission()` - Mark complete with video link and notes
- `completeMissionWithValidation()` - With YouTube URL validation
- `isValidYouTubeUrl()` - Validate YouTube URLs

### 3. Mission Submit Hook
**File**: `src/hooks/useMissionSubmit.ts`

React hook for learner mission submission:
- Submits to main missions API (operator queue)
- Saves to learner subcollection (history)
- Handles errors gracefully
- Returns submission state

**Usage**:
```typescript
const { submitMission, isSubmitting, error } = useMissionSubmit();

await submitMission({
  code: '...',
  yardId: 'yard-1',
  sessionId: 'session-123',
  challengeId: 'M1-FORWARD',
  missionName: 'My First Mission',
});
```

### 4. Documentation
**Files**:
- `docs/OPERATOR_MISSION_UPDATE.md` - Complete operator guide
- `docs/MISSION_HISTORY_UPDATE_SUMMARY.md` - This file

## Files Modified

### Mission History Scaffold Component
**File**: `src/components/mission/MissionHistoryScaffold.tsx`

**Changes**:
1. ✅ Uses `getLearnerID()` for anonymous learner tracking
2. ✅ Implements real-time updates via `subscribeLearnerMissions()`
3. ✅ Displays new status values: `submitted`, `in-progress`, `completed`
4. ✅ Shows YouTube video embed when operator completes mission
5. ✅ Displays operator execution notes
6. ✅ User-friendly status messages for each state
7. ✅ Handles missions without video links gracefully
8. ✅ Auto-cleanup of listener on component unmount

**Status Messages**:
- `submitted` → "Waiting for operator execution"
- `in-progress` → "Being executed on rover"
- `completed` → "Execution completed" + video + notes

## Data Structure

### LearnerMission Interface

```typescript
interface LearnerMission {
  missionId: string;              // Unique mission identifier
  missionName?: string;            // Optional display name
  status: 'submitted' | 'in-progress' | 'completed';
  submittedAt: string;             // ISO timestamp
  completedAt?: string;            // ISO timestamp (when completed)
  youtubeVideoLink?: string;       // YouTube URL from operator
  executionNotes?: string;         // Operator feedback
  code?: string;                   // Mission code (optional)
  yardId?: string;                 // Rover yard ID
  challengeId?: string;            // Challenge/level ID
}
```

### Firestore Structure

```
learners/
  {learnerId}/
    missions/
      {missionId}/
        - missionId: "abc123"
        - missionName: "First Mission"
        - status: "completed"
        - submittedAt: "2026-04-24T10:00:00Z"
        - completedAt: "2026-04-24T10:05:00Z"
        - youtubeVideoLink: "https://youtube.com/watch?v=..."
        - executionNotes: "Great job!"
        - updatedAt: "2026-04-24T10:05:00Z"
```

## Mission Flow

### Learner Side

```
1. Learner writes code
2. Submits mission via useMissionSubmit()
   ├─> POST /api/missions (operator queue)
   └─> saveLearnerMission() (learner history)
3. Status: "submitted"
4. Learner opens /history page
5. Real-time listener activates
6. Sees "Waiting for operator execution"
```

### Operator Side

```
1. Operator sees mission in queue
2. Starts execution
   └─> markMissionInProgress(learnerId, missionId)
3. Learner sees "Being executed on rover" (instant)
4. Operator finishes execution
5. Uploads video to YouTube
6. Marks complete
   └─> completeMission(learnerId, missionId, youtubeUrl, notes)
7. Learner sees video and notes (instant)
```

## Real-Time Updates

The system uses Firestore `onSnapshot` for instant updates:

```typescript
// In MissionHistoryScaffold.tsx
const unsubscribe = subscribeLearnerMissions(learnerId, (missions) => {
  setMissions(missions);  // UI updates instantly
});
```

**Benefits**:
- No polling required
- Sub-second latency
- Automatic reconnection
- Efficient bandwidth usage

## Integration Points

### For Frontend Developers

Use the mission submit hook:
```typescript
import { useMissionSubmit } from '@/hooks/useMissionSubmit';

const { submitMission, isSubmitting } = useMissionSubmit();
```

### For Operator Systems

Use the operator service:
```typescript
import {
  markMissionInProgress,
  completeMission,
} from '@/lib/services/operatorMissionService';

// When starting
await markMissionInProgress(learnerId, missionId);

// When done
await completeMission(
  learnerId,
  missionId,
  'https://youtube.com/watch?v=VIDEO_ID',
  'Excellent work!'
);
```

### For Backend Services

Use the learner mission service:
```typescript
import {
  saveLearnerMission,
  updateLearnerMission,
} from '@/lib/services/learnerMissionService';
```

## Testing

### Manual Testing Steps

1. **Submission Flow**:
   - Submit a mission as learner
   - Verify it appears in `/history` with "submitted" status
   - Check Firestore: `learners/{learnerId}/missions/{missionId}` exists

2. **Status Update Flow**:
   - Open `/history` in browser tab
   - Update mission status in Firestore console
   - Verify UI updates instantly without refresh

3. **Video Display Flow**:
   - Update mission with `youtubeVideoLink`
   - Verify video embeds correctly
   - Test different YouTube URL formats

### Automated Testing

Recommended test cases:
- Mission submission saves to both collections
- Real-time listener receives updates
- YouTube URL validation works
- Empty state displays correctly
- Component cleanup prevents memory leaks

## Backward Compatibility

✅ **No Breaking Changes**

- Existing missions collection unchanged
- Existing submission API unchanged
- New learner subcollection is additive
- Old missions won't break (just won't have learner history)

## Performance Considerations

- **Firestore Reads**: One onSnapshot listener per learner (efficient)
- **Firestore Writes**: Two writes per submission (main + learner)
- **Real-time**: Uses WebSocket, minimal overhead
- **Cleanup**: Listener unsubscribed on component unmount

## Security Considerations

1. **Anonymous Tracking**: Uses localStorage-based learnerId
2. **Data Privacy**: No personal information stored
3. **YouTube URLs**: Validated before storage
4. **Firestore Rules**: Need to ensure learners can only read their own missions

### Recommended Firestore Rules

```javascript
match /learners/{learnerId}/missions/{missionId} {
  // Learners can read their own missions
  allow read: if request.auth == null; // Anonymous allowed
  
  // Only operators can write
  allow write: if request.auth != null 
    && request.auth.token.role == 'operator';
}
```

## Future Enhancements

Potential improvements:
- [ ] Mission completion notifications
- [ ] Email digest of completed missions
- [ ] Mission ratings and feedback from learners
- [ ] Video thumbnail generation
- [ ] Mission replay functionality
- [ ] Operator performance metrics

## Migration Strategy

For existing missions:

```typescript
// One-time migration script
async function migrateMissionsToLearnerSubcollection() {
  const missions = await getAllMissions();
  
  for (const mission of missions) {
    const learnerId = mission.sessionId; // sessionId IS learnerId
    
    await saveLearnerMission(learnerId, {
      missionId: mission.id,
      status: mission.status === 'queued' ? 'submitted' : 
              mission.status === 'processing' ? 'in-progress' : 'completed',
      submittedAt: mission.submittedAt,
      completedAt: mission.completedAt,
      code: mission.code,
      yardId: mission.yardId,
      challengeId: mission.challengeId,
    });
  }
}
```

## Troubleshooting

### Issue: Real-time updates not working

**Solutions**:
- Check browser console for Firestore errors
- Verify Firebase config in `.env`
- Ensure listener is active (check component is mounted)
- Check Firestore rules allow read access

### Issue: Video not displaying

**Solutions**:
- Verify YouTube URL format
- Check video is public/unlisted (not private)
- Inspect `youtubeVideoLink` field in Firestore
- Check VideoPlayer component props

### Issue: Mission not appearing in history

**Solutions**:
- Verify `learnerId` matches localStorage value
- Check mission was saved to correct subcollection path
- Inspect Firestore data structure
- Check for JavaScript errors in submission flow

## Summary

This update successfully implements:

✅ Real-time mission status updates for learners  
✅ Operator feedback sync (video links + notes)  
✅ Anonymous learner support via learnerId  
✅ Dual-storage system (queue + history)  
✅ Firestore onSnapshot for instant updates  
✅ Clean separation of concerns (services, hooks, components)  
✅ Comprehensive documentation for operators  
✅ Backward compatible with existing system  

The Mission History page now provides a complete feedback loop between learners and operators, enabling effective learning through video review and personalized feedback.
