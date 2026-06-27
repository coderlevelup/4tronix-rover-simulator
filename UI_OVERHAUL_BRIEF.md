# Mission Control - UI overhaul brief

A self-contained brief for an autonomous UI agent. You will not have prior chat
context; everything you need is here.

## What this product is
Mission Control is the learner-facing hub of a Mars rover coding platform (a UCT
student project for Sapient.rocks / CoderLevelUp). Kids write rover programs,
mostly with **Blockly blocks** (block coding is where South African school
curricula are), sometimes Python. They submit a program, an operator runs it on
a real rover in a "yard," and the kid watches a video of the run. A 2D simulator
lets them compare the simulated run with the real one.

It is a **Next.js 16 (App Router, Turbopack)** app in `mission-control/`, styled
with Tailwind v4 using a custom dark "Mars" theme.

## Who we are designing for
Children, roughly ages 5 to 15, many of whom have never coded. It runs on
laptops at science centers and in classrooms (design desktop-first) and on
phones. It must feel like a fun, exciting space-mission product, a kid-friendly
cross between YouTube and micro:bit MakeCode, never an enterprise dashboard.

## The mandate
Overhaul the UI to be **marvelous, genuinely kid-friendly, and exciting**, while:
1. **No scroll.** Every screen fits the viewport. Nothing scrolls the page;
   content that overflows scrolls *inside its own panel*.
2. **Perfect sizing.** Use the create-mission workspace as the reference: `main`
   is `h-[calc(100vh-64px)] overflow-hidden` (the navbar is 64px tall), a compact
   header, then a flex/grid body that fills the remaining height; inner panels
   use `min-h-0 flex-1` and scroll internally.
3. Elevate the existing theme, do not replace it wholesale.

## Hard rules (do not break)
- **No em dashes anywhere** (copy, code, comments, commit messages). The product
  owner dislikes them strongly. Use commas, parentheses, or rephrase. Hyphens
  are fine.
- **Learners never see "Failed."** A mission's learner-facing status is
  **Completed or Pending only** (failed / queued / processing all read as
  "Pending"). Helper: `src/lib/discoveryStatus.ts`. The operator console may show
  the true status.
- **Blocks are the hero.** Blockly is the main thing kids touch; lead with
  blocks, treat Python as secondary (the detail page has a Blocks|Python toggle;
  manual control uses block-styled tap buttons).
- **Keep it simple.** Visual/UX overhaul only. No new features. Challenges and
  leaderboard were deliberately retired; do not reintroduce them.
- **Verify by screenshot.** Run the app and look at every screen you change (see
  "How to run"). Do not ship UI you have not seen rendered.

## Design system (use these tokens, avoid raw hex)
Tailwind tokens already exist: `bg-background`, `bg-card` (and `/50`),
`border-border`, `text-foreground`, `text-muted-foreground`, `text-primary`,
`bg-gradient-mars` (orange), `text-gradient-mars`, `font-display` (headings),
`font-mono`. Accent is Mars orange; theme is dark.
- No neon glows. The owner disliked the original "glowy" look; aim clean, punchy,
  YouTube-like.
- Echo the Blockly category colours where blocks appear: movement `#2196F3`,
  spin `#9C27B0`, steer `#00BCD4`, stop `#f44336`, uplink/hat `#FF6D00`.

## Screens to overhaul (priority order)
1. **Landing feed `/` (`src/app/page.tsx`)** - the home / mission viewer.
   YouTube-style grid of mission cards (thumbnail, title, status badge, run-time,
   code peek), search + status filters, a "Create Mission" CTA. Make it exciting
   and instantly legible to a kid; move any scrolling into the grid so the page
   does not scroll.
2. **Mission detail `/missions/[id]` (`src/app/missions/[missionId]/MissionVideoClient.tsx`)**
   - the mission preview: run dropdown (Simulated / Real run), the player (2D sim
   canvas or YouTube), a Blocks|Python toggle, stat chips, a remix CTA. Already
   viewport-fit; make it delightful and confirm no scroll.
3. **Workspace `/mission` (`MissionWorkspace`, `EditorPanel`, `SimulationPanel`,
   `ManualControlRealtime`, `BlocklyEditor`, `MonacoCodeEditor`)** - where kids
   build missions (Manual / Blockly / Python modes + the 2D simulator). The core
   creation experience; make it inviting and playful. Already viewport-fit.
4. **Navbar, login, history, operator console `/operator`** - polish to match.

## Inspiration
- **YouTube** for the feed cards and the run viewer (owner's explicit reference).
- **micro:bit MakeCode** (makecode.microbit.org) for the blocks-first editor and
  the Blocks/Python toggle (owner's explicit reference).
- Friendly Mars/space theme: rover, terrain, mission patches.

## Kid-friendly specifics
- Big, obvious, tappable targets; bold friendly type; one clear primary action
  per screen.
- Playful but uncluttered; generous spacing within the no-scroll constraint.
- Encouraging, simple language (reading age ~8). A mission completing should feel
  rewarding.
- Strong colour and iconography so pre-readers can navigate.
- Accessible: good contrast, visible focus states, aria-labels on icon buttons.

## Technical constraints
- Next.js 16 + Turbopack. `mission-control/AGENTS.md` warns these Next APIs
  differ from older versions; read `node_modules/next/dist/docs/` before using
  Next APIs.
- Reuse Tailwind tokens; avoid raw slate/hex except the Blockly category colours.
- Blockly loads from a CDN at runtime (no `@types`); read-only renderer is
  `src/components/mission/BlocklyViewer.tsx`.
- Gates that must stay green: `npm run lint` (0 errors, it is in CI),
  `npx next build`, `npx jest`. Two react-hooks rules are intentionally "warn".
- Do not add heavy dependencies without reason (hosting cost matters).

## How to run and verify (required)
- `npm run dev:control` (root script; `mission-control/.env` already has Firebase
  config), serves on port 3000.
- Wait for a route, then screenshot headless:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000
  --screenshot=/tmp/out.png "http://localhost:3000/<route>"` (give Blockly/terrain
  pages ~11000). Then open the PNG and look.
- Check **no scroll** at 1440x900, 1280x800, and 1024x768 for every screen.
- Workspace pages (`/mission`, `/mission?mode=blockly`) render without data;
  detail pages need a real mission id.

## Out of scope
Deployment/CD, backend/API, the yard/rover Python, retired challenges/leaderboard,
and any new product features. Visual and UX only.

## Definition of done
Every screen: marvelous and kid-exciting, on-theme, fits the viewport with no
page scroll at common laptop sizes, no em dashes, learners never see "Failed",
lint/build/tests green, and each screen verified by a screenshot you actually
looked at.
