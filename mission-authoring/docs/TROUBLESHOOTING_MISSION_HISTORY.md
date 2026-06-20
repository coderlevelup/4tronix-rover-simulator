# Troubleshooting Mission History

## Issue: Missions not appearing in history after submission

### Root Cause
The mission history page looks for missions in the **learner subcollection** (`learners/{learnerId}/missions`), but missions also need to be saved to the **main missions collection** (`missions/{missionId}`) for the operator queue.

### Solution Applied
Updated `MissionWorkspaceScaffold.tsx` to save missions to BOTH locations:
1. Main collection (for operators)
2. Learner subcollection (for history)

### How to Verify It's Working

#### Step 1: Check learnerId
Open browser console and run:
```javascript
localStorage.getItem('mars-rover-learner-id')
```
You should see a unique ID like `abcd1234xyz`. This is your learnerId.

#### Step 2: Submit a mission
1. Go to the mission workspace
2. Write some code (e.g., `rover.forward(100)`)
3. Click "Send to Rover Queue"
4. Check console for these messages:
   - ✅ Mission submitted: {mission object}
   - ✅ Mission saved to learner history

#### Step 3: Check Firestore
Open Firebase Console → Firestore Database

**Main collection** (for operators):
```
missions/
  {missionId}/
    ├─ id: "abc123"
    ├─ code: "rover.forward(100)"
    ├─ sessionId: "your-learner-id"
    ├─ status: "queued"
    └─ yardId: "uct-rover-1"
```

**Learner subcollection** (for history):
```
learners/
  {your-learner-id}/
    missions/
      {missionId}/
        ├─ missionId: "abc123"
        ├─ missionName: "Mission abc123"
        ├─ status: "submitted"
        ├─ code: "rover.forward(100)"
        ├─ submittedAt: "2026-04-24T..."
        └─ yardId: "uct-rover-1"
```

#### Step 4: Check Mission History Page
1. Navigate to `/history`
2. You should see your submitted mission
3. Status should show: "Waiting for operator execution"

### Common Issues

#### Issue: "No missions yet" on history page

**Check 1**: Verify learnerId consistency
```javascript
// In browser console
localStorage.getItem('mars-rover-learner-id')
```

**Check 2**: Verify mission was saved to Firestore
- Go to Firebase Console
- Navigate to: `learners/{your-learner-id}/missions`
- Check if missions exist

**Check 3**: Check browser console for errors
- Open DevTools → Console
- Look for Firebase/Firestore errors
- Common error: "Missing or insufficient permissions"

#### Issue: Mission saved but not appearing in real-time

**Check**: Verify onSnapshot listener is active
```javascript
// In browser console, you should see:
"📋 Reusing existing learner ID: your-id"
```

If not, the component may not be mounted or there's a React error.

#### Issue: "Failed to save to learner history" in console

This is a **non-critical warning**. The mission is still submitted to the operator queue.

**Possible causes**:
1. Firestore rules preventing write access
2. Firebase not initialized
3. Network issue

**Check Firestore Rules**:
```javascript
// Required rules for learner missions
match /learners/{learnerId}/missions/{missionId} {
  // Allow anonymous writes (learners submitting missions)
  allow write: if true;
  
  // Allow reads for anyone (could be more restrictive)
  allow read: if true;
}
```

### Testing the Full Flow

#### Test 1: Submission
```bash
# Expected console output:
✅ Mission submitted: {id: "abc123", ...}
✅ Mission saved to learner history
```

#### Test 2: Real-time Updates
1. Open `/history` page
2. Keep it open
3. Open Firebase Console in another tab
4. Update mission status: `submitted` → `in-progress`
5. History page should update **instantly** without refresh

#### Test 3: Operator Completion
```javascript
// In Firebase Console, add to mission document:
{
  status: "completed",
  completedAt: "2026-04-24T10:05:00Z",
  youtubeVideoLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  executionNotes: "Test completion"
}
```

History page should show:
- ✅ Green "completed" badge
- ✅ YouTube video embed
- ✅ Operator notes section

### Firestore Structure Reference

```
firestore/
├─ missions/ (main collection for operators)
│  └─ {missionId}/
│     ├─ id
│     ├─ sessionId (= learnerId)
│     ├─ code
│     ├─ status: "queued"|"processing"|"completed"|"failed"
│     ├─ yardId
│     └─ timestamps
│
└─ learners/ (learner-specific data)
   └─ {learnerId}/
      └─ missions/ (subcollection for history)
         └─ {missionId}/
            ├─ missionId
            ├─ status: "submitted"|"in-progress"|"completed"
            ├─ submittedAt
            ├─ completedAt
            ├─ youtubeVideoLink
            ├─ executionNotes
            └─ code
```

### Migration: Existing Missions

If you have existing missions in the main collection that aren't showing in history:

```typescript
// Run this once in browser console on /history page
async function migrateExistingMissions() {
  const learnerId = localStorage.getItem('mars-rover-learner-id');
  const sessionId = localStorage.getItem('rover-session-id');
  
  // Fetch missions from main collection
  const response = await fetch(`/api/missions?sessionId=${sessionId}`);
  const data = await response.json();
  
  // Import services
  const { saveLearnerMission } = await import('/src/lib/services/learnerMissionService.ts');
  
  // Save each to learner subcollection
  for (const mission of data.missions) {
    await saveLearnerMission(learnerId, {
      missionId: mission.id,
      missionName: `Mission ${mission.id.slice(0, 8)}`,
      status: mission.status === 'queued' ? 'submitted' : 
              mission.status === 'processing' ? 'in-progress' : 'completed',
      submittedAt: mission.submittedAt,
      completedAt: mission.completedAt,
      code: mission.code,
      yardId: mission.yardId,
    });
  }
  
  console.log('Migration complete! Refresh the page.');
}

migrateExistingMissions();
```

### Debug Checklist

- [ ] Firebase config in `.env.local` is correct
- [ ] `mars-rover-learner-id` exists in localStorage
- [ ] Browser console shows no React errors
- [ ] Firestore rules allow read/write to learners collection
- [ ] Mission appears in Firebase Console under both collections
- [ ] History page shows loading spinner then missions
- [ ] Real-time updates work (test by editing in Firebase Console)

### Still Not Working?

1. **Clear localStorage and try again**:
```javascript
localStorage.clear();
location.reload();
```

2. **Check Firebase connection**:
```javascript
import { getFirestoreClient } from '@/lib/firebase';
const db = getFirestoreClient();
console.log('Firebase initialized:', !!db);
```

3. **Verify onSnapshot is working**:
Add this temporarily to `MissionHistoryScaffold.tsx`:
```typescript
console.log('Subscribing to missions for learnerId:', id);
```

4. **Check Network tab**:
- DevTools → Network
- Look for Firestore requests
- Check for 403 (permissions) or 404 (not found) errors

### Contact / Report Issues

If none of these steps work, provide:
1. Browser console logs (full output)
2. Firestore structure screenshot
3. localStorage values
4. Firebase Console rules screenshot

This will help diagnose the issue quickly.
