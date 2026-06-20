# Mars Rover Mission Control

Operator-facing mission control for the Mars rover platform. This repo contains the Next.js app used by science center staff to log in, inspect the mission queue, configure rover connections, run missions, trigger emergency stop, and replay missions through the simulator service.

The root route redirects to `/operator`.

## What is in this repo

- Next.js 16 app router UI for operator login and console flows.
- Firebase Auth and Firestore integration, including server-side session and claim checks.
- Operator API routes for missions, queue, rover configs, emergency stop, and simulator execution.
- A Python simulator service in `simulator-service/` that the app talks to through `/api/simulator/execute`.
- Unit, integration, and end-to-end tests under `src/__tests__/`.

This repository does not contain the learner/authoring app or the physical yard hardware service. Those are separate parts of the wider platform.

## Main routes

- `/login` operator sign-in.
- `/operator` operator dashboard.
- `/operator/config` rover configuration management.
- `/operator/rover/[missionId]` execution flow for a mission on a rover.
- `/operator/simulator/[missionId]` execution flow using the simulator.

## Repository layout

```text
src/
	app/                 Next.js pages and API routes
	components/          Operator UI and shared components
	core/                Domain and application logic
	infrastructure/      Firebase, auth, validation, persistence
	hooks/               React hooks
	lib/                 Client Firebase helpers
simulator-service/     Python Flask simulator API
scripts/               Dev helpers for web and simulator startup
docs/                  Project and integration docs
```

## Requirements

- Node.js 18 or newer.
- Python 3.9 or newer.
- A Firebase project with Firestore enabled.
- Firebase service account credentials for server-side access.

## Environment variables

Create your local env file from the example and fill in the values used by the app:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"

SIMULATOR_SERVICE_URL=http://localhost:8080
GROUND_STATION_URL=http://localhost:8523
```

Keep `FIREBASE_PRIVATE_KEY` quoted so the newline escapes stay intact.

## Local development

1. Install dependencies.

```bash
npm install
```

2. Copy the example environment file and edit the values.

```bash
cp .env.example .env
```

3. Start the full local stack.

```bash
npm run dev
```

`npm run dev` launches the Next.js app and the simulator service together. The simulator script creates `simulator-service/venv` and installs Python dependencies on first run if the virtual environment is missing.

If you want to run pieces separately:

```bash
npm run dev:web   # Next.js only
npm run dev:sim   # simulator service only
```

To start the simulator manually:

```bash
cd simulator-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python simulator_api.py
```

## Available scripts

- `npm run dev` runs the web app and simulator together.
- `npm run dev:web` runs only the Next.js app.
- `npm run dev:sim` runs only the simulator service.
- `npm run build` builds the app for production.
- `npm run start` starts the production build.
- `npm run lint` runs ESLint.
- `npm test` runs Jest.
- `npm run test:coverage` runs Jest with coverage.
- `npm run migrate:claims` runs the Firebase custom-claims migration script.

## Simulator flow

The operator console sends simulation requests to `/api/simulator/execute`. That route forwards the code to the simulator service, which returns trajectory data for visualization and validation.

## Notes

- The app uses protected operator routes, so valid Firebase auth and operator claims are required for console access.
- If you are working against a remote simulator, set `SIMULATOR_SERVICE_URL` to that service instead of `http://localhost:8080`.
- Do not commit `.env` files or Firebase private keys.
