#!/usr/bin/env bash
# start-mac.sh — launch both satellite services on a MacBook
#
# Usage:
#   ./start-mac.sh                        # default venv at ./mac-env
#   VENV=~/my-venv ./start-mac.sh         # custom venv path
#   ROVER_URL=http://curiosity.local:8523 ./start-mac.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="${VENV:-$SCRIPT_DIR/mac-env}"
PYTHON="$VENV/bin/python"

if [[ ! -x "$PYTHON" ]]; then
    echo "Venv not found at $VENV"
    echo "Create it first:"
    echo "  python3 -m venv $VENV"
    echo "  $VENV/bin/pip install -r $SCRIPT_DIR/requirements-mac.txt"
    exit 1
fi

echo "Starting Mars Yard satellite (Mac mode)"
echo "  Web server:      http://localhost:5050"
echo "  Camera stream:   ws://localhost:8890"
echo "  Camera control:  http://localhost:8891"
echo "  Press Ctrl-C to stop both services"
echo ""

# Kill both child processes cleanly on Ctrl-C
cleanup() {
    echo ""
    echo "Stopping services…"
    kill "$WEB_PID" "$CAM_PID" 2>/dev/null || true
    wait "$WEB_PID" "$CAM_PID" 2>/dev/null || true
    echo "Done."
}
trap cleanup INT TERM

cd "$SCRIPT_DIR"

"$PYTHON" web_server.py &
WEB_PID=$!

"$PYTHON" mac_camera_server.py &
CAM_PID=$!

# Wait for either process to exit
wait -n "$WEB_PID" "$CAM_PID" 2>/dev/null || true
# If one exited, kill the other
kill "$WEB_PID" "$CAM_PID" 2>/dev/null || true
wait "$WEB_PID" "$CAM_PID" 2>/dev/null || true
