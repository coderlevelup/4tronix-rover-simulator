# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres, informally, to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project has no tagged releases; the version numbers below are inferred
retroactively from the commit history to group related work.

## [Unreleased]

## [0.14.0] - 2026-08-20

Contributors: David Campey

### Fixed
- `yard/satellite/start-mac.sh` no longer relies on `wait -n`, which requires
  bash 4.3+; macOS ships bash 3.2, so the script now polls instead.

## [0.13.0] - 2026-06-19

Contributors: David Campey

### Added
- MacBook satellite mode: webcam stream and camera picker, so a laptop can
  stand in for the satellite Pi during local dev or in a classroom without one.

## [0.12.0] - 2026-06-13

Contributors: David Campey, Manos Zeakis

### Added
- `/status` page: component health badges, rover mast-camera detection, and
  editable rover URL.
- Resilience hardening: interruptible student code, watchdog, systemd service,
  manual updates.
- `yard/camcheck.sh` rover camera diagnostic and a worked camera-diagnosis
  method (with Heisenbug discipline) in the manual.
- Blockly Mast block category (servo turn, distance sensing, take a picture)
  and Lights block category (set all LEDs / set single LED to a colour).
- SSH + `drive.sh` fallback documented for direct rover testing.

### Changed
- Monitor shows a "Photo failed" placeholder when `take_photo()` errors
  instead of failing silently.
- Recoloured Blockly blocks: Wait matches the Control category's orange,
  Lights category is purple.
- Test doubles renamed to match taxonomy (fake driver, spy service).

### Fixed
- Duplicated loop-body blocks in Blockly code generation.

## [0.11.0] - 2026-03-28

Contributors: David Campey

### Added
- `run_python` instruction type and a Python editor tab, later upgraded from
  a plain textarea to the Monaco editor.
- Blockly workspace preview and nicely rendered `run_python` code blocks in
  the monitor queue.
- "On uplink" block (renamed from "On receive"), enforced in the workspace,
  restored automatically if cleared.
- Satellite hostname and IP shown on the monitor; local IP detection fixed
  for offline networks.

### Changed
- Monitor polling replaced with SSE push for live updates.
- Tablet UI scaled up for primary-school use.
- Camera and rover status badges prefixed with labels.

### Fixed
- Stop button, steer direction, and SSE for remote clients (threaded mode,
  reloader disabled).

## [0.10.0] - 2026-03-25

Contributors: David Campey

### Added
- Headless Pi imaging and WiFi setup docs, hardware assembly notes, and a
  Bookworm/Trixie upgrade plan (later simplified for the Pi Zero, with a
  Trixie-avoidance note and a boot-twitch startup animation to confirm the
  hardware is alive).
- Mast pan controls in `driveRover.py`, with smooth 1-degree increments per
  keypress and reassigned speed keys.
- Retry of rover hardware init if not ready on boot.

### Changed
- `driveRover.py` is symlinked instead of copied onto the Pi.
- Motors stop before pivot/spin to prevent a lurch when toggling spin
  direction; `RealRoverDriver` pivots before spinning for proper wheel
  alignment and passes brightness through to `rover.init()`.

### Fixed
- Mast pan direction (comma = left, dot = right).
- macOS workaround for generating `userconf.txt` (Pi user creation) via
  Python instead of the Linux-only tool.

## [0.9.0] - 2026-03-06

Contributors: David Campey

### Changed
- Rover server refactored to a Ports & Adapters architecture, documented in
  the README.
- Documentation reorganized: detailed docs moved to `docs/`, READMEs
  simplified and made beginner-friendly, main README now links out to `yard`
  and the visual simulator instead of duplicating their setup steps.

## [0.8.0] - 2026-01-27

Contributors: David Campey

### Added
- `yard` queue-based rover control system, replacing direct command dispatch
  with a queued instruction model.

## [0.7.0] - 2025-12-04

Contributors: David Campey

### Added
- High-level command API for faster rover control.
- Directional LED indicators for movement, including a rotating green
  animation during spin commands.
- Steer left / steer right manual controls and corresponding Blockly steering
  blocks (replacing the differential-drive blocks).
- Blockly workspace persistence to `localStorage`, with tab preservation and
  a `mode` URL parameter (renamed from `tab`).

### Changed
- Web interface split into separate pages for the real rover and the
  simulator.

### Fixed
- LED front/rear mapping (iterated through a few wrong pairings before
  confirming the correct one).
- Steering: `forward()` is called before setting servos.
- Blockly XML API compatibility, block connections when loading from
  `localStorage`, and workspace-save debouncing (consolidated event
  listeners).

## [0.6.0] - 2025-11-28

Contributors: David Campey

### Added
- Pi AI Camera (IMX500) streaming with on-device object detection and
  confidence-percentage bounding boxes.
- Comprehensive AI camera setup docs and systemd setup instructions.

### Changed
- Web interface defaults to the `marspi` target.
- Setup docs use `git clone`/`pull` instead of `scp`, and the Pi user is
  `mars` instead of `pi` throughout.
- Rover server runs as root for LED hardware access.

### Fixed
- WebSocket connection closing immediately (kept alive); handler signature
  updated for a newer `websockets` library version.
- Color inversion — camera stream converted from BGR to RGB.
- IMX500 initialization and postprocessing compatibility, worked through
  several iterations before settling on the object-detection implementation.

## [0.5.0] - 2025-11-11

Contributors: David Campey

### Added
- HTTP interface that can target either the simulator or the real rover.

### Fixed
- Layout and bugfixes in the web interface.

## [0.4.0] - 2025-09-22

Contributors: David Campey

### Added
- WebRTC streaming to the simulator.
- Simple Blockly interface, and a web interface pulling video from both the
  rover and the satellite.

### Changed
- Web interface reorganized into a sub-folder, with RTC handling refactored
  and tests organized.
- DriveRover logic updated so the rover and simulator pivot consistently.

### Fixed
- Simulator steering logic.

## [0.3.0] - 2025-08-18

Contributors: David Campey, Manos Zeakis

### Added
- Initial remote-control UI with a 4-instruction interface, tabbed layout,
  and an on-device camera feed later upgraded to a live stream.
- README notes for an (untested) UV4L setup approach.

## [0.2.0] - 2025-03-12

Contributors: David Campey

### Added
- `square.py` sample script driving the rover in a square.
- Spin-on-the-spot handling in the simulator UI.

### Changed
- Simulator screen given a Mars-themed look.

### Fixed
- Real rover requires an `init()` call to run successfully.

## [0.1.0] - 2023-05-21

Contributors: Ian Griffiths

### Added
- Initial visual rover simulator.
