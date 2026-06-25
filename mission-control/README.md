# Mars Rover Mission Authoring

A learner-focused platform for authoring and testing Mars rover missions using visual block programming and text editing.

## Prerequisites

- Node.js 18+ 
- npm 9+
- Firebase project with Firestore enabled

## Installation

1. Clone the repository:
```
Fastest way is to use Azure's cloning to your IDE, you can use git clone but you have to generate credentials in Azure when cloning.
cd mars-rover-mission-control
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```
.env file is committed with the firebase App config. so you can skip step 4 unless reconfiguring.
```

4. Fill in your Firebase configuration in `.env`. **Be careful not to commit real Firebase keys or credentials to the repository:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_client_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_client_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_client_app_id
NEXT_PUBLIC_SIMULATOR_API_URL=http://localhost:8080
```


## Running Locally

Start the development server (runs both web and simulator):
```bash
npm run dev
```

The web app will be available at `http://localhost:3000` and the simulator API at `http://localhost:8080`.

## Project Structure

- `src/app/` - Next.js pages and routes
- `src/components/` - React components (editors, mission workspace, simulator)
- `src/contexts/` - React context providers (authentication, learner tracking)
- `src/infrastructure/` - Data persistence and external services
- `src/hooks/` - Custom React hooks for mission submission and learner state
- `simulator-service/` - Flask-based rover physics simulator

## How It Works

1. Learners create missions using the visual block editor (Blockly) or text editor (Monaco)
2. Missions are submitted to Firebase Firestore with normalized code and auto-generated IDs
3. Learner mission history is tracked per browser session
4. When executed, mission code runs against the rover simulator
5. Results are displayed in the mission workspace

## Learn More

- Check out [docs/](docs/) for guides on mission history, learner tracking, and validation
- See the mission workspace at `/mission` and mission list at `/missions`

## Editors

- **Visual Block Editor:** A Blockly-based drag-and-drop editor for building missions visually inside the mission workspace. Ideal for learners who prefer visual programming.
- **Text Editor:** A Monaco-based text editor for editing mission code directly (JavaScript/JSON). You can switch between editors when creating or editing a mission.

## Mission Catalogue

- The mission catalogue (available at `/missions`) lists published missions with metadata (difficulty, tags, thumbnail) and actions to run or edit missions. Missions are persisted in Firestore so instructors and learners can browse and reuse authored content.

## Mission History

- Learner mission history tracks submissions, outcomes, and timestamps for each learner or session. History is viewable in the mission history UI and is stored in Firestore to enable replay, review, and export of past attempts.
