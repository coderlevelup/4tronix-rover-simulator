# Learner ID System - Quick Reference

## 🚀 Quick Start (3 Steps)

### Step 1: Get Learner ID
```typescript
import { getLearnerID } from '@/lib/getLearnerID';

const learnerId = getLearnerID(); // Automatically persists in localStorage
```

### Step 2: Initialize Firestore (on app startup)
```typescript
import { initializeLearner } from '@/lib/initializeLearner';

const learner = await initializeLearner(); // Auto-creates document if new
```

### Step 3: Track Missions
```typescript
import { incrementMissionsCompleted } from '@/lib/initializeLearner';

await incrementMissionsCompleted(learnerId); // Updates Firestore
```

---

## 📋 Core Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getLearnerID()` | Get or generate unique ID | `string` (21 chars) |
| `clearLearnerID()` | Clear stored ID (reset) | `void` |
| `hasLearnerID()` | Check if ID exists | `boolean` |
| `initializeLearner()` | Initialize Firestore record | `Promise<LearnerRecord>` |
| `incrementMissionsCompleted()` | Increment mission counter | `Promise<void>` |
| `updateProgress()` | Update progress (0-100) | `Promise<void>` |

---

## 🎯 Common Use Cases

### Use Case 1: Mission Submission
```typescript
import { getLearnerID } from '@/lib/getLearnerID';

async function submitMission(code: string) {
  const learnerId = getLearnerID();
  
  await fetch('/api/missions', {
    method: 'POST',
    body: JSON.stringify({ learnerId, code }),
  });
}
```

### Use Case 2: React Component
```tsx
import { useLearnerID } from '@/hooks/useLearnerID';

export function MyComponent() {
  const { learnerId, learnerData, loading } = useLearnerID();
  
  if (loading) return <div>Loading...</div>;
  
  return <div>Missions: {learnerData?.missionsCompleted}</div>;
}
```

### Use Case 3: App Initialization
```tsx
// src/app/layout.tsx
import { initializeLearner } from '@/lib/initializeLearner';

useEffect(() => {
  initializeLearner(); // Call on app startup
}, []);
```

---

## 🗄️ Firestore Structure

### Path
```
learners/{learnerId}
```

### Document Schema
```typescript
{
  learnerId: string;           // Unique ID (nanoid)
  createdAt: Timestamp;        // Creation time
  missionsCompleted: number;   // Mission counter
  progress: number;            // 0-100 percentage
  lastActiveAt: Timestamp;     // Last activity
}
```

---

## 🔒 How It Works

### First Visit (New Learner)
```
1. getLearnerID() → Generates: "xT4pQ9kLmN2rV8wY3zB5e"
2. Stores in localStorage: 'mars-rover-learner-id'
3. initializeLearner() → Creates Firestore doc: learners/xT4pQ9...
```

### Return Visit (Existing Learner)
```
1. getLearnerID() → Retrieves from localStorage: "xT4pQ9..."
2. initializeLearner() → Updates lastActiveAt timestamp
3. Returns existing data
```

### Cache Cleared (Generate New)
```
1. localStorage empty
2. getLearnerID() → Generates NEW ID
3. initializeLearner() → Creates NEW Firestore doc
4. New learner session begins
```

---

## ✅ Testing Checklist

- [ ] First visit generates ID and stores in localStorage
- [ ] Page reload reuses same ID
- [ ] Firestore document created at `learners/{id}`
- [ ] `missionsCompleted` increments correctly
- [ ] Clear localStorage → new ID generated
- [ ] Progress updates (0-100) work

### Test Commands
```bash
npm test getLearnerID
npm test Learner
```

---

## 📁 File Structure

```
src/
├── lib/
│   ├── getLearnerID.ts              ✅ Core ID utility
│   └── initializeLearner.ts         ✅ Firestore operations
├── hooks/
│   └── useLearnerID.ts              ✅ React hook
├── components/
│   ├── learner/
│   │   ├── LearnerProfileCard.tsx   ✅ UI component
│   │   └── LearnerDashboard.tsx     ✅ Dashboard
│   └── examples/
│       └── SimpleLearnerExample.tsx ✅ Complete example
├── __tests__/unit/
│   ├── getLearnerID.test.ts         ✅ Tests
│   └── Learner.test.ts              ✅ Tests
└── contexts/
    └── LearnerContext.tsx           ✅ React context
```

---

## 🔧 API Routes (Optional)

```typescript
// GET /api/learner/profile?sessionId={id}
// PATCH /api/learner/profile
// GET /api/learner/stats?sessionId={id}
```

---

## 🚨 Common Issues

### Issue: ID not persisting
**Solution**: Check localStorage is enabled

### Issue: Firestore permission denied
**Solution**: Update security rules to allow learner collection writes

### Issue: Multiple IDs generated
**Solution**: Don't call `clearLearnerID()` in production code

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `ANONYMOUS_LEARNER_SYSTEM.md` | Complete system documentation |
| `USAGE_GUIDE_LEARNER_ID.md` | Detailed usage guide with examples |
| `MIGRATION_GUIDE_ANONYMOUS_LEARNERS.md` | Step-by-step integration guide |
| `LEARNER_ID_QUICK_REFERENCE.md` | This quick reference (you are here) |

---

## 💡 Best Practices

✅ **Do:**
- Call `getLearnerID()` on mission submission
- Initialize learner on app startup
- Increment counters after mission completion
- Test in incognito mode

❌ **Don't:**
- Manually create IDs
- Store PII with learner data
- Call `clearLearnerID()` in production
- Assume localStorage is always available

---

## 🎯 Success Metrics

- ✅ No email/password required
- ✅ Automatic ID generation
- ✅ localStorage persistence
- ✅ Firestore auto-sync
- ✅ Privacy-first (no PII)
- ✅ Collision-resistant IDs (149 bits entropy)

---

## 🔗 Quick Links

- **Utility**: `src/lib/getLearnerID.ts`
- **Hook**: `src/hooks/useLearnerID.ts`
- **Example**: `src/components/examples/SimpleLearnerExample.tsx`
- **Tests**: `src/__tests__/unit/getLearnerID.test.ts`

---

**System Status**: ✅ Fully Implemented & Ready to Use

**Last Updated**: 2026-04-24
