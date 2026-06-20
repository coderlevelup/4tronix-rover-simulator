# Integration Quick Start Guide

**Purpose:** Get the three-repo system running together for the first time.

---

## Prerequisites

- Node.js 18+
- Python 3.9+
- Firebase project with Firestore enabled
- Git access to all three repos

---

## Repository Setup

### 1. Clone All Three Repos

```bash
cd ~/Documents

# If not already cloned:
git clone <mars-rover-mission-authoring-url>
git clone <mars-rover-mission-control-url>
git clone <4tronix-rover-simulator-url>
```

### 2. Verify Directory Structure

```
~/Documents/
├── mars-rover-mission-authoring/    # Learner app (tablets)
├── mars-rover-mission-control/      # Operator app
└── 4tronix-rover-simulator/         # Rover hardware code
    └── yard/                         # Local yard system
```

---

## Firebase Configuration

### 1. Use Same Firebase Project

All three apps must point to the **same Firebase project**.

**Check `.env` files:**

```bash
# Authoring app
cat ~/Documents/mars-rover-mission-authoring/.env
# Should have: NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project

# Mission Control app
cat ~/Documents/mars-rover-mission-control/.env
# Should have: FIREBASE_PROJECT_ID=your-project (same!)
```

### 2. Firestore Security Rules

Update Firebase security rules to allow:
- **Authoring app:** Write-only for `missions/` (learners can submit)
- **Mission Control:** Full CRUD for `missions/`, `rover-configs/`, `yards/`

**Rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Missions - shared collection
    match /missions/{missionId} {
      // Authoring app: Write-only (create new missions)
      allow create: if request.auth != null || true; // Anonymous allowed
      
      // Mission Control: Full access (operators only)
      allow read, update, delete: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'operator';
    }
    
    // Rover configs - Mission Control only
    match /rover-configs/{configId} {
      allow read, write: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'operator';
    }
    
    // Yards - Mission Control only
    match /yards/{yardId} {
      allow read, write: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'operator';
    }
    
    // Learner history - Authoring app (local to learner)
    match /learners/{learnerId}/missions/{missionId} {
      allow read, write: if true; // Public (localStorage-based learnerId)
    }
  }
}
```

---

## Running All Three Apps

### Terminal 1: Mission Authoring (Learner App)

```bash
cd ~/Documents/mars-rover-mission-authoring
npm install
npm run dev
```

**Access:** http://localhost:3000  
**Purpose:** Learners submit missions here

---

### Terminal 2: Mission Control (Operator App)

```bash
cd ~/Documents/mars-rover-mission-control
npm install

# Start simulator service (Python)
cd simulator-service
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python simulator_api.py &

# Start Next.js app
cd ..
npm run dev
```

**Access:** http://localhost:3001 (or 3000 if authoring not running)  
**Purpose:** Operators manage queue and execute missions

**Note:** Adjust port if conflict with authoring app:
```bash
PORT=3001 npm run dev
```

---

### Terminal 3: Local Yard System (Optional - for physical rover testing)

**Only needed if you have Raspberry Pis with real rover hardware.**

#### On Rover Pi (marspi.local):

```bash
ssh mars@marspi.local
cd ~/4tronix-rover-simulator/yard/rover
python rover_server.py
```

**Access:** http://marspi.local:8523

#### On Satellite Pi (mro.local):

```bash
ssh mars@mro.local
cd ~/4tronix-rover-simulator/yard/satellite

# Terminal 1: Camera server
python camera_server.py &

# Terminal 2: Web server
python web_server.py
```

**Access:** 
- Web server: http://mro.local:5050
- Camera stream: ws://mro.local:8890

---

## Testing the Integration

### Test 1: Submit a Mission (Authoring → Firebase)

1. Open **Mission Authoring** at http://localhost:3000
2. Write simple code:
   ```python
   rover.forward(100)
   time.sleep(2)
   rover.stop()
   ```
3. Select **Yard:** "yard-1"
4. Click **Submit Mission**
5. Check Firebase Firestore console → `missions/` collection
   - Should see new mission with `status: 'queued'`

**Expected:**
```json
{
  "id": "abc123",
  "yardId": "yard-1",
  "sessionId": "learner-xyz",
  "code": "rover.forward(100)\ntime.sleep(2)\nrover.stop()",
  "status": "queued",
  "submittedAt": "2026-05-14T10:30:00Z"
}
```

---

### Test 2: View Mission in Queue (Mission Control)

1. Open **Mission Control** at http://localhost:3001/operator
2. Log in as operator (if auth enabled)
3. Navigate to queue page
4. **Expected:** See the mission submitted in Test 1

**Screenshot target:**
```
┌─────────────────────────────────────────┐
│  Mission Queue                          │
├─────────────────────────────────────────┤
│  • Mission abc123                       │
│    Learner: learner-xyz                 │
│    Status: Queued                       │
│    [Run]                                │
└─────────────────────────────────────────┘
```

---

### Test 3: Execute on Simulator (Mission Control → Simulator)

1. In **Mission Control** queue, click **Run** on the mission
2. **Expected:** Opens execution page `/operator/rover/execute/abc123`
3. **Verify:**
   - Selected rover shows (e.g., "Cloud Simulator")
   - Code preview displays
   - Execute button is enabled
4. Click **Execute Mission**
5. **Expected:**
   - Status changes to "Processing"
   - Simulator canvas/feed shows rover moving
   - After 2 seconds, status changes to "Completed"

---

### Test 4: Real-Time Status Updates (Firebase → Authoring)

**Optional:** If you added status updates to authoring app.

1. In **Mission Authoring** app, go to mission history
2. While Test 3 is running, watch status change:
   - "Queued" → "Processing" → "Completed"
3. **Expected:** Real-time updates without page refresh

---

## Troubleshooting

### Problem: Missions not appearing in Mission Control

**Check:**
1. Both apps use same Firebase project
2. Firestore security rules allow reads
3. Mission has correct `yardId` (matches operator's yard filter)

**Debug:**
```bash
# Check Firebase Firestore directly
firebase firestore:get missions --project your-project-id
```

---

### Problem: Simulator not starting

**Check:**
```bash
cd ~/Documents/mars-rover-mission-control/simulator-service
python simulator_api.py
```

**Expected output:**
```
* Running on http://127.0.0.1:8080
* Simulator physics engine initialized
```

**If port conflict:**
```bash
PORT=8081 python simulator_api.py
```

Update `.env`:
```
NEXT_PUBLIC_SIMULATOR_API_URL=http://localhost:8081
```

---

### Problem: CORS errors in browser console

**Cause:** Mission Control (localhost:3001) trying to access Simulator (localhost:8080)

**Fix:** Add CORS headers to `simulator_api.py`:

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow all origins for development
```

Install CORS:
```bash
pip install flask-cors
```

---

### Problem: Camera stream not connecting (physical rover)

**Check:**
1. Both devices on same network
2. Camera server running: `ps aux | grep camera_server`
3. WebSocket port not blocked: `telnet mro.local 8890`

**Restart camera server:**
```bash
ssh mars@mro.local
pkill -f camera_server.py
cd ~/4tronix-rover-simulator/yard/satellite
python camera_server.py
```

---

## Next Steps

Once all three apps are running:

1. ✅ **Phase 1 complete** - Schema alignment
2. **Start Phase 2** - Add rover type to RoverConfig
3. **Implement execution page** - Build UI components
4. **Build Ground Station Agent** - Bridge cloud and hardware

---

## Quick Reference

| App | URL | Purpose |
|-----|-----|---------|
| **Authoring** | http://localhost:3000 | Learners submit missions |
| **Mission Control** | http://localhost:3001 | Operators execute missions |
| **Simulator API** | http://localhost:8080 | Physics simulation |
| **Rover Pi** | http://marspi.local:8523 | Real rover queue |
| **Satellite Web** | http://mro.local:5050 | Camera/monitoring |
| **Camera Stream** | ws://mro.local:8890 | Pi AI Camera WebSocket |

---

## Environment Variables Checklist

### Authoring App (`.env`)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_SIMULATOR_API_URL=http://localhost:8080
```

### Mission Control App (`.env`)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
GROUND_STATION_URL=http://localhost:8523
```

---

**Last Updated:** May 14, 2026  
**Status:** Ready for Phase 1 testing
