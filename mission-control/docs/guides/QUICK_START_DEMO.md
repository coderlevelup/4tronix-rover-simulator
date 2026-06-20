# Quick Start - Rover Simulator Demo

## See the Rover Move in Your Browser! 🚀

Follow these steps to see a working square pattern demo:

### Step 1: Start the Simulator API (Terminal 1)

```bash
cd /Users/hlali/Documents/mars-rover-cloud-platform/simulator-service

# Create virtual environment (first time only)
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the API
python simulator_api.py
```

You should see:
```
 * Running on http://0.0.0.0:8080
 * Press CTRL+C to quit
```

### Step 2: Start the Frontend (Terminal 2)

```bash
cd /Users/hlali/Documents/mars-rover-cloud-platform

# Start Next.js dev server
npm run dev
```

You should see:
```
  ▲ Next.js 16.2.4
  - Local:        http://localhost:3000
```

### Step 3: Open in Browser

1. Navigate to: **http://localhost:3000/mission**

2. You'll see:
   - **Left panel**: Square pattern code (hardcoded demo)
   - **Right panel**: Empty brown yard canvas

3. Click the **"▶ Run Demo"** button

4. Watch the magic! 🎉
   - Rover appears in the center
   - Blue trail shows its path
   - Info panel shows position/heading
   - Rover draws a square pattern!

### What You're Seeing

The demo executes this mission:

```python
rover.forward(60, 2)    # Move forward 12cm
rover.spinRight(50, 2)  # Turn right ~90°
rover.forward(60, 2)    # Move forward 12cm
rover.spinRight(50, 2)  # Turn right ~90°
rover.forward(60, 2)    # Move forward 12cm
rover.spinRight(50, 2)  # Turn right ~90°
rover.forward(60, 2)    # Move forward 12cm
rover.stop()            # Stop
```

**Flow:**
1. Frontend sends commands to `http://localhost:8080/api/simulate`
2. Python API runs physics simulation
3. Returns ~80 trajectory points
4. Canvas renders each point with animation
5. You see the rover move!

### Troubleshooting

**Error: "Failed to fetch" or "API error: Network Error"**
- ✅ Make sure simulator API is running (Step 1)
- ✅ Check it's on port 8080: `curl http://localhost:8080/health`
- ✅ Should return: `{"status":"healthy","service":"rover-simulator"}`

**Canvas shows "Click Run Demo" but nothing happens**
- ✅ Open browser console (F12) for errors
- ✅ Check API is reachable
- ✅ Try manually: `curl -X POST http://localhost:8080/api/simulate -H "Content-Type: application/json" -d '{"commands":[{"command":"forward","speed":60,"duration":1}]}'`

**Rover doesn't move / canvas is blank**
- ✅ Trajectory data is returned but not rendering
- ✅ Check browser console for canvas errors
- ✅ Try resetting: Refresh page and click Run Demo again

### Testing the API Manually

```bash
# Health check
curl http://localhost:8080/health

# Run simple forward command
curl -X POST http://localhost:8080/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command": "forward", "speed": 60, "duration": 2}
    ]
  }' | jq

# Should return trajectory with ~20 points
```

### What's Next?

Once you see the square working:

1. **Try different patterns** - Edit `MissionWorkspaceScaffold.tsx` to change commands
2. **Add text editor** - Let users write their own missions
3. **Deploy to Cloud Run** - See `simulator-service/README.md`
4. **Add obstacles** - Enhance the yard visualization
5. **Multiple missions** - Save and replay trajectories

### Architecture Recap

```
Browser (localhost:3000)
    ↓ POST /api/simulate
    ↓ {"commands": [...]}
    ↓
Python API (localhost:8080)
    ↓ Execute physics simulation
    ↓ Return {"trajectory": [...]}
    ↓
Browser Canvas
    ↓ Render each trajectory point
    ↓ Animate rover movement
    ✓ Done!
```

### Files Involved

**Frontend:**
- `src/components/mission/MissionWorkspaceScaffold.tsx` - Demo UI & API call
- `src/components/mission/RoverSimulatorScaffold.tsx` - Canvas renderer
- `src/app/mission/page.tsx` - Mission page

**Backend:**
- `simulator-service/simulator_api.py` - Headless simulator API
- `simulator-service/requirements.txt` - Python dependencies

### Performance

- **API response time**: 50-100ms
- **Trajectory points**: ~10 per second of mission time
- **Canvas FPS**: 10 (smooth animation)
- **Total demo duration**: ~16 seconds (8 commands × 2s each)

Enjoy the demo! 🎉

---

**Need help?** Check the main docs:
- `SIMULATOR_CLOUD_RUN_APPROACH.md` - Full architecture
- `simulator-service/README.md` - API documentation
