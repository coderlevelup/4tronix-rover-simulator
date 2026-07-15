# Mars Rover Mission Control

A learner-focused platform for authoring and testing Mars rover missions. Learners drive a simulated rover manually, snap Blockly blocks together, or write Python against the real rover API, preview the run in the built-in 2D simulator, and submit the mission for execution on a physical 4tronix M.A.R.S. rover.

## Prerequisites

- Node.js 18+
- npm 9+
- A Firebase project with Firestore and Authentication enabled

## Getting Started

1. Install dependencies:

```bash
cd mission-control
npm install
```

2. Create your environment file from the template and fill in your Firebase config:

```bash
cp .env.example .env
```

The client-side `NEXT_PUBLIC_FIREBASE_*` values come from your Firebase project settings. The `FIREBASE_*` admin values (service account) and `ADMIN_API_SECRET` are server-side only. Never commit real credentials; `.env` is gitignored.

3. Start the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

## Scripts

- `npm run dev` - development server (port 3000)
- `npm run build` / `npm start` - production build and serve
- `npm run lint` - ESLint
- `npm test` - Jest unit and integration tests

## Routes

- `/` - landing page with the mission feed
- `/mission` - the mission workspace (manual drive, Blockly, and Python editors plus the simulator)
- `/history` - the learner's own mission history
- `/missions/[missionId]` - mission detail with run video and code viewer

There is no login and no operator surface in this app: learners are anonymous, and the operator console lives on the yard satellite server (see below).

## Project Structure

- `src/app/` - Next.js pages and API routes
- `src/components/` - React components (editors, simulator, workspace, layout)
- `src/contexts/` - React context providers (auth, learner session)
- `src/core/` - domain entities and application services
- `src/infrastructure/` - Firestore persistence, Firebase auth, and the code-sandbox allowlist
- `src/lib/` - client utilities (simulation, rendering, learner identity, Firebase client)
- `src/proxy.ts` - route protection for operator pages and APIs (verifies the Firebase session token)

## How It Works

1. Learners build a mission in the workspace: driving manually records commands, and the Blockly and Python editors generate rover code.
2. The in-browser 2D simulator previews the trajectory before submission; a simulation video can be captured for the mission record.
3. Submitted code passes an AST-based allowlist check so only approved rover commands reach the queue.
4. Missions are stored in Firestore and picked up for execution on the physical rover; learners track status from their history.
5. At the yard, operators work the queue from the yard satellite's operator console, sending missions to the rover, marking them complete, and attaching the run video.

## Where the Operator Console Lives

Not here. This app is the public, learner-facing side only: no login, no auth, no operator routes.

The operator console is part of the yard system (`yard/satellite/`, Flask + plain HTML/JS, port 3001), served at `/operator/` alongside the yard's existing `/code/` and `/monitor/` pages. Operators sign in there with their Firebase operator account; the console reads the mission queue from the same Firestore this app writes to, sends mission code to the rover queue with one tap, and records completion plus the YouTube link that this app then shows to learners. See `yard/satellite/.env.example` for its configuration.

## Rover Python API

The Python editor targets the real rover's low-level API, for example:

```python
import rover
import time

rover.init(0)
rover.forward(50)
time.sleep(1)
rover.stop()
rover.setServo(0, 30)
```

## Testing

`npm test` runs the Jest suite (unit tests for the domain services, parsers, and sandbox plus integration tests for the API routes).
