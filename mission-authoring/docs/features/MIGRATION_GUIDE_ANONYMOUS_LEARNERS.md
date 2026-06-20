# Migration Guide: Adding Anonymous Learner System

This guide explains how to integrate the anonymous learner identification system into existing mission submission workflows.

## Prerequisites

1. ✅ All new files have been created (see file list below)
2. ✅ `LearnerProvider` added to root layout
3. ✅ Firestore `learners` collection configured
4. ✅ `nanoid` package already installed (v5.1.9)

## Step 1: Update Mission Submission API

### Before (Without Learner Tracking)

```typescript
// src/app/api/missions/route.ts
export async function POST(request: NextRequest) {
  const { code, yardId } = await request.json();
  
  const mission = {
    id: nanoid(),
    code,
    yardId,
    status: 'queued',
    submittedAt: new Date().toISOString(),
  };
  
  await missionRepo.create(mission);
  
  return NextResponse.json({ missionId: mission.id });
}
```

### After (With Learner Tracking)

```typescript
// src/app/api/missions/route.ts
import { FirestoreLearnerRepository } from '@/infrastructure/persistence/FirestoreLearnerRepository';

const learnerRepo = new FirestoreLearnerRepository();

export async function POST(request: NextRequest) {
  const { code, yardId, sessionId } = await request.json(); // Add sessionId
  
  // Validate sessionId
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    );
  }
  
  const mission = {
    id: nanoid(),
    code,
    yardId,
    sessionId, // Add sessionId to mission
    status: 'queued',
    submittedAt: new Date().toISOString(),
  };
  
  await missionRepo.create(mission);
  
  // Increment learner mission counter
  try {
    await learnerRepo.incrementMissionCount(sessionId);
  } catch (error) {
    console.error('Failed to update learner stats:', error);
    // Don't fail the mission submission if stats update fails
  }
  
  return NextResponse.json({ missionId: mission.id });
}
```

## Step 2: Update Mission Completion Handler

Add learner statistics tracking when missions complete:

```typescript
// When mission status changes to 'completed'
if (mission.status === 'completed' && mission.executionResult?.isSuccessful) {
  try {
    await learnerRepo.incrementCompletedMissions(mission.sessionId);
  } catch (error) {
    console.error('Failed to update completion stats:', error);
  }
}
```

## Step 3: Update Frontend Mission Submission

### Before

```tsx
// components/mission/MissionWorkspaceScaffold.tsx
const handleSubmit = async () => {
  const response = await fetch('/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      yardId,
    }),
  });
};
```

### After

```tsx
import { useLearner } from '@/contexts/LearnerContext';

export function MissionWorkspaceScaffold() {
  const { sessionId } = useLearner(); // Add this
  
  const handleSubmit = async () => {
    if (!sessionId) {
      alert('Session not initialized. Please refresh the page.');
      return;
    }
    
    const response = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        yardId,
        sessionId, // Add sessionId
      }),
    });
  };
}
```

## Step 4: Add Learner Profile UI

Add the learner profile card to your mission page:

```tsx
// src/app/mission/page.tsx
import { LearnerProfileCard } from '@/components/learner/LearnerProfileCard';

export default function MissionPage() {
  return (
    <main>
      {/* Add profile card in sidebar or header */}
      <aside className="w-80">
        <LearnerProfileCard />
      </aside>
      
      {/* Existing mission editor */}
      <MissionWorkspaceScaffold />
    </main>
  );
}
```

## Step 5: Update Mission History Queries

Filter missions by sessionId:

```typescript
// src/app/history/page.tsx
import { useLearner } from '@/contexts/LearnerContext';

export default function HistoryPage() {
  const { sessionId } = useLearner();
  
  useEffect(() => {
    if (sessionId) {
      fetchMissions(sessionId);
    }
  }, [sessionId]);
  
  async function fetchMissions(sessionId: string) {
    const response = await fetch(`/api/missions?sessionId=${sessionId}`);
    // ...
  }
}
```

## Step 6: Update Firestore Security Rules

Add rules for the `learners` collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anonymous learners collection
    match /learners/{learnerId} {
      // Anyone can read learner profiles (privacy-safe data only)
      allow read: if true;
      
      // Anyone can create new learner profiles
      allow create: if request.resource.data.sessionId == learnerId;
      
      // Only allow updating certain fields
      allow update: if request.resource.data.sessionId == learnerId &&
                       // Prevent tampering with mission counters directly
                       request.resource.data.missionCount >= resource.data.missionCount &&
                       request.resource.data.completedMissions >= resource.data.completedMissions;
    }
    
    // Missions collection - filter by sessionId
    match /missions/{missionId} {
      allow read: if request.auth == null; // Allow anonymous reads
      allow create: if request.resource.data.sessionId != null;
    }
  }
}
```

## Step 7: Testing Checklist

- [ ] **New User Flow**
  - Visit site for first time
  - Verify session is created in localStorage
  - Verify learner document created in Firestore
  - Verify avatar color assigned

- [ ] **Mission Submission**
  - Submit a mission
  - Verify `sessionId` included in mission document
  - Verify `missionCount` incremented in learner document

- [ ] **Mission Completion**
  - Complete a mission successfully
  - Verify `completedMissions` incremented
  - Verify success rate updates correctly

- [ ] **Profile Updates**
  - Update display name
  - Verify sanitization (email removal)
  - Verify persistence across reload

- [ ] **Session Persistence**
  - Reload page
  - Verify session persists
  - Verify learner data loads correctly

- [ ] **Multi-Tab Behavior**
  - Open multiple tabs
  - Verify same session used
  - Verify mission counters consistent

## Common Issues & Solutions

### Issue: Session not persisting

**Cause**: localStorage disabled or cleared

**Solution**: Add fallback message to users:

```tsx
import { isStorageAvailable } from '@/lib/anonymous-auth';

if (!isStorageAvailable()) {
  return <div>Please enable cookies to use this feature.</div>;
}
```

### Issue: Mission counter not incrementing

**Cause**: Firestore permission denied

**Solution**: Check security rules allow writes to `learners` collection

### Issue: Display name contains email

**Cause**: Sanitization not applied

**Solution**: Always use `sanitizeDisplayName()` before saving:

```typescript
import { sanitizeDisplayName } from '@/core/domain/entities/Learner';

const cleaned = sanitizeDisplayName(userInput);
```

## Rollback Plan

If issues arise, you can disable learner tracking without breaking missions:

1. Make `sessionId` optional in mission submission
2. Skip learner counter updates (add try-catch)
3. Hide learner profile UI components
4. Missions will still work without learner tracking

```typescript
// Graceful degradation
const { sessionId } = useLearner();

await fetch('/api/missions', {
  body: JSON.stringify({
    code,
    yardId,
    ...(sessionId && { sessionId }), // Optional
  }),
});
```

## Performance Considerations

### Firestore Operations

- **Mission submission**: +1 read, +1 write to learners (minimal overhead)
- **Mission completion**: +1 write to learners
- **Profile load**: 1 read on page load (cached in React context)

### Optimization Tips

1. **Batch updates**: Use Firestore batched writes for mission + learner updates
2. **Client-side caching**: LearnerContext caches profile data
3. **Async increments**: Use `increment()` to avoid read-modify-write cycles

## Next Steps

After migration is complete:

1. Monitor Firestore usage in Firebase Console
2. Review learner statistics for insights
3. Consider adding achievement system
4. Plan optional authentication upgrade path

## Files Created

- ✅ `src/core/domain/entities/Learner.ts`
- ✅ `src/core/domain/repositories/ILearnerRepository.ts`
- ✅ `src/lib/anonymous-auth.ts`
- ✅ `src/contexts/LearnerContext.tsx`
- ✅ `src/infrastructure/persistence/FirestoreLearnerRepository.ts`
- ✅ `src/components/learner/LearnerProfileCard.tsx`
- ✅ `src/components/learner/LearnerDashboard.tsx`
- ✅ `src/app/api/learner/profile/route.ts`
- ✅ `src/app/api/learner/stats/route.ts`
- ✅ `src/__tests__/unit/anonymous-auth.test.ts`
- ✅ `src/__tests__/unit/Learner.test.ts`
- ✅ `ANONYMOUS_LEARNER_SYSTEM.md`
- ✅ `MIGRATION_GUIDE_ANONYMOUS_LEARNERS.md`

## Support

For questions during migration:
- Review `ANONYMOUS_LEARNER_SYSTEM.md` for detailed API docs
- Check unit tests for usage examples
- Test in development environment first
