# Anonymous Learner Identification System

## Overview

This system provides privacy-first, anonymous learner identification without requiring email or password authentication. Learners are identified using browser-based session IDs generated with cryptographically strong random identifiers.

## Key Features

- ✅ **No Authentication Required**: Learners can start immediately without signup
- ✅ **Privacy-First**: No PII collection, session stored locally
- ✅ **Persistent Identity**: Session persists across page reloads via localStorage
- ✅ **Optional Personalization**: Learners can optionally add a display name
- ✅ **Mission Tracking**: Track mission submissions and completion rates
- ✅ **Multi-Device Detection**: Basic device fingerprinting for analytics

## Architecture

### Core Components

1. **`Learner` Entity** (`src/core/domain/entities/Learner.ts`)
   - Domain model for anonymous learners
   - Tracks mission statistics and activity
   - Supports multiple device sessions

2. **Anonymous Auth Service** (`src/lib/anonymous-auth.ts`)
   - Generates unique session IDs using `nanoid` (21 chars, ~149 bits entropy)
   - Manages localStorage persistence
   - Provides browser fingerprinting for device tracking

3. **LearnerContext** (`src/contexts/LearnerContext.tsx`)
   - React context for managing learner state
   - Auto-initializes session on app mount
   - Syncs with Firestore for persistence

4. **Firestore Repository** (`src/infrastructure/persistence/FirestoreLearnerRepository.ts`)
   - Implements `ILearnerRepository` interface
   - Manages learner data in Firestore `learners` collection
   - Provides analytics queries

## Data Model

### Firestore Collection: `learners`

Document ID: `{sessionId}` (nanoid-generated)

```typescript
{
  id: string;                    // Same as sessionId
  sessionId: string;             // Unique browser session ID
  displayName?: string;          // Optional nickname (max 20 chars)
  avatarColor?: string;          // Random color for UI (#HEX)
  missionCount: number;          // Total missions submitted
  completedMissions: number;     // Successfully completed missions
  createdAt: Timestamp;          // Account creation
  lastActiveAt: Timestamp;       // Last activity
  devices: [
    {
      sessionId: string;
      firstSeenAt: Timestamp;
      lastSeenAt: Timestamp;
      deviceFingerprint?: string;
    }
  ]
}
```

## Usage Guide

### Frontend Integration

#### 1. Access Learner Session in Components

```tsx
import { useLearner } from '@/contexts/LearnerContext';

export function MyComponent() {
  const { learner, sessionId, loading } = useLearner();

  if (loading) return <div>Loading...</div>;
  if (!learner) return <div>No session</div>;

  return (
    <div>
      <p>Session: {sessionId}</p>
      <p>Missions: {learner.missionCount}</p>
    </div>
  );
}
```

#### 2. Update Display Name

```tsx
const { updateDisplayName } = useLearner();

await updateDisplayName('RoverPilot123');
```

#### 3. Include LearnerProfileCard

```tsx
import { LearnerProfileCard } from '@/components/learner/LearnerProfileCard';

<LearnerProfileCard />
```

### Backend Integration

#### Increment Mission Counter When Submitting

```typescript
import { FirestoreLearnerRepository } from '@/infrastructure/persistence/FirestoreLearnerRepository';

const learnerRepo = new FirestoreLearnerRepository();

// When mission is submitted
await learnerRepo.incrementMissionCount(sessionId);

// When mission completes successfully
await learnerRepo.incrementCompletedMissions(sessionId);
```

#### Get Learner Statistics

```typescript
const stats = await learnerRepo.getStatistics(sessionId);
// Returns: { totalMissions, completedMissions, successRate }
```

## API Endpoints

### GET `/api/learner/profile?sessionId={id}`

Retrieve learner profile by session ID.

**Response:**
```json
{
  "learner": {
    "id": "abc123...",
    "sessionId": "abc123...",
    "displayName": "RoverPilot123",
    "avatarColor": "#3B82F6",
    "missionCount": 15,
    "completedMissions": 12,
    "createdAt": "2026-04-24T10:00:00Z",
    "lastActiveAt": "2026-04-24T14:30:00Z"
  }
}
```

### PATCH `/api/learner/profile`

Update learner profile (display name only).

**Request Body:**
```json
{
  "sessionId": "abc123...",
  "updates": {
    "displayName": "NewName"
  }
}
```

### GET `/api/learner/stats?sessionId={id}`

Get learner mission statistics.

**Response:**
```json
{
  "stats": {
    "totalMissions": 15,
    "completedMissions": 12,
    "successRate": 80
  }
}
```

## Security & Privacy Considerations

### What We Collect
- ✅ Session ID (random, non-identifiable)
- ✅ Optional display name (sanitized, no PII)
- ✅ Mission statistics (counts only)
- ✅ Browser fingerprint (basic device tracking)

### What We DON'T Collect
- ❌ Email addresses
- ❌ Passwords
- ❌ Real names
- ❌ IP addresses (not stored)
- ❌ Precise location data

### Privacy Features

1. **Local Storage Only**: Session ID stored in browser localStorage
2. **No External Tracking**: No third-party analytics on learner sessions
3. **PII Sanitization**: Display names are sanitized to remove email patterns
4. **Voluntary Participation**: Learners can reset session anytime

## Session Management

### Session Lifecycle

1. **First Visit**
   - Generate unique sessionId (nanoid)
   - Store in localStorage
   - Create learner document in Firestore
   - Generate random avatar color

2. **Return Visit**
   - Retrieve sessionId from localStorage
   - Fetch existing learner from Firestore
   - Update lastActiveAt timestamp

3. **Session Reset**
   - User can clear session via `resetSession()`
   - Creates new identity with new sessionId

### Session Persistence

Sessions persist across:
- ✅ Page reloads
- ✅ Browser restarts
- ✅ Different tabs (same browser)

Sessions are lost when:
- ❌ Browser cache/localStorage is cleared
- ❌ User explicitly resets session
- ❌ Using different browser/device

## Analytics & Reporting

### Available Metrics

```typescript
// Active learners in last N days
const activeCount = await learnerRepo.getActiveLearnerCount(7);

// Individual learner stats
const stats = await learnerRepo.getStatistics(sessionId);
```

### Firestore Queries

```typescript
// Find learners by last active
const q = query(
  collection(db, 'learners'),
  where('lastActiveAt', '>=', cutoffDate),
  orderBy('lastActiveAt', 'desc')
);
```

## Testing

### Unit Tests

```bash
npm test Learner
npm test anonymous-auth
npm test FirestoreLearnerRepository
```

### Manual Testing Checklist

- [ ] New learner session is created on first visit
- [ ] Session persists after page reload
- [ ] Display name can be updated
- [ ] Mission counters increment correctly
- [ ] Profile card displays correctly
- [ ] Session can be reset
- [ ] Works with localStorage disabled (graceful degradation)

## Future Enhancements

### Planned Features
- [ ] Multi-device session linking
- [ ] Session transfer via QR code
- [ ] Achievement/badge system
- [ ] Leaderboard (optional opt-in)
- [ ] Session history export

### Progressive Enhancement Path
- [ ] Optional authentication (preserve sessionId when upgrading)
- [ ] Social login integration (link anonymous session)
- [ ] Parent/teacher accounts (link learner sessions)

## Integration with Mission System

The `Mission` entity already includes `sessionId` field:

```typescript
interface Mission {
  sessionId: string;  // Links to learner
  learnerUid?: string; // Optional for future auth
  // ... other fields
}
```

### Updating Mission Submission Flow

```typescript
// 1. Get learner session
const { sessionId } = useLearner();

// 2. Submit mission with sessionId
await fetch('/api/missions', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    code: '...',
    yardId: '...',
  }),
});

// 3. Increment learner mission counter
await learnerRepo.incrementMissionCount(sessionId);

// 4. On mission completion
await learnerRepo.incrementCompletedMissions(sessionId);
```

## Troubleshooting

### Session Not Persisting
- Check localStorage is enabled in browser
- Verify Firestore rules allow read/write to `learners` collection
- Check browser console for errors

### Display Name Not Updating
- Ensure display name is ≤20 characters
- Check for PII patterns (emails are blocked)
- Verify Firestore connection

### Mission Counters Not Incrementing
- Verify `sessionId` is passed to mission submission
- Check Firestore transaction permissions
- Review server logs for errors

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /learners/{learnerId} {
      // Allow read if sessionId matches
      allow read: if request.auth == null || 
                     request.auth.token.learnerId == learnerId;
      
      // Allow create for anonymous users
      allow create: if request.auth == null &&
                       request.resource.data.sessionId == learnerId;
      
      // Allow update own profile
      allow update: if request.auth == null &&
                       request.resource.data.sessionId == learnerId;
    }
  }
}
```

## Related Documentation

- [Mission Entity](./src/core/domain/entities/Mission.ts)
- [Firebase Setup](./src/lib/firebase.ts)
- [Repository Pattern](./src/core/domain/repositories/ILearnerRepository.ts)

## Support

For questions or issues, see:
- GitHub Issues: [mars-rover-cloud-platform/issues](https://github.com/...)
- Team Slack: #mars-rover-dev
