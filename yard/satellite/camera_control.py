"""
Starting and restarting the camera server from the console.

Today the camera is a separate process an operator has to start by hand over
SSH, which at an event means finding a laptop and a terminal. This exposes the
same one-tap control the rover URL already has on /status.

TWO ENVIRONMENTS, TWO MECHANISMS

On the Pi the camera is a systemd unit (yard/deploy/satellite-camera.service)
with Restart=always. There, the console asks systemd. It must NOT fork its own
copy: two camera servers would fight over the same device, and a web-spawned
one dies whenever the web server restarts, which is exactly when you least
want the camera to disappear.

On a development machine there is no systemd, so it spawns the script directly.

SECURITY

The command is hardcoded. Nothing from the request reaches it - not as a
string, not as an argument. The one configurable value (which camera device to
open) is validated as an integer and passed through the environment, never
interpolated into a command line. subprocess is always called with a list and
shell=False, so there is no shell to inject into.

That matters more than usual here: this console is reachable by anyone on the
venue network, and OPERATOR_AUTH=off removes the login entirely on event days.
"""

import os
import shutil
import socket
import subprocess
import sys
import time

SERVICE_NAME = 'satellite-camera'
SCRIPT_NAME = 'camera_server.py'
SATELLITE_DIR = os.path.dirname(os.path.abspath(__file__))

# Where a console-spawned camera writes its output. Sending it to DEVNULL
# throws away the only explanation of why a start failed - and the failures
# here are almost always explicable (no camera plugged in, or macOS refusing
# access until Camera permission is granted), so the operator should see them.
DEV_LOG = os.path.join(SATELLITE_DIR, 'camera_server.log')

# How long to wait before deciding the process died on startup rather than
# starting slowly. The camera binds in well under a second when it works.
STARTUP_GRACE_SECONDS = 1.5

# Process handle for the development path only. systemd owns the lifecycle on
# the Pi, so nothing is tracked there.
_dev_process = None


def _systemctl():
    """Path to systemctl, or None when this box does not use systemd."""
    return shutil.which('systemctl')


def is_systemd_managed():
    """True when the camera unit is installed on this machine.

    Checked rather than assumed: a Pi that has not run the deploy scripts yet
    has systemd but no unit, and should fall back to the dev path rather than
    failing with a confusing systemctl error.
    """
    systemctl = _systemctl()
    if not systemctl:
        return False
    try:
        result = subprocess.run(
            [systemctl, 'list-unit-files', f'{SERVICE_NAME}.service'],
            capture_output=True, text=True, timeout=5,
        )
        return f'{SERVICE_NAME}.service' in (result.stdout or '')
    except (subprocess.SubprocessError, OSError):
        return False


def is_listening(host='localhost', port=None):
    port = int(port or os.environ.get('CAMERA_PORT', 8890))
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def _run_systemctl(action):
    systemctl = _systemctl()
    try:
        result = subprocess.run(
            [systemctl, action, f'{SERVICE_NAME}.service'],
            capture_output=True, text=True, timeout=15,
        )
    except (subprocess.SubprocessError, OSError) as e:
        return False, str(e)

    if result.returncode == 0:
        return True, f'systemd: {action} {SERVICE_NAME}'

    detail = (result.stderr or result.stdout or '').strip()
    # The most common failure by far, and the least obvious from the raw text.
    if 'access denied' in detail.lower() or 'authentication' in detail.lower():
        detail += (
            ' - the satellite user needs permission to manage this unit. '
            'Add a polkit rule or a sudoers entry for '
            f'`systemctl restart {SERVICE_NAME}`.'
        )
    return False, detail or f'systemctl {action} failed'


def _spawn_dev(camera_index=None):
    """Development fallback: run the script directly.

    Only ever used where systemd is absent. The command is fixed; camera_index
    travels in the environment after being coerced to an int.
    """
    global _dev_process

    if _dev_process and _dev_process.poll() is None:
        _dev_process.terminate()
        try:
            _dev_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _dev_process.kill()

    env = dict(os.environ)
    if camera_index is not None:
        env['CAMERA_INDEX'] = str(int(camera_index))

    try:
        log = open(DEV_LOG, 'w')
        _dev_process = subprocess.Popen(
            [sys.executable, SCRIPT_NAME],
            cwd=SATELLITE_DIR,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,  # survives a web-server reload
        )
    except (OSError, ValueError) as e:
        return False, str(e)

    # A camera that cannot open its device exits immediately. Reporting
    # "started" and letting the operator wait for a feed that will never
    # arrive is worse than saying why now.
    time.sleep(STARTUP_GRACE_SECONDS)
    if _dev_process.poll() is not None:
        return False, _last_log_line() or (
            f'{SCRIPT_NAME} exited immediately (code {_dev_process.returncode})'
        )

    return True, f'started {SCRIPT_NAME} (pid {_dev_process.pid})'


# Lines that report the CONSEQUENCE of a failure rather than its cause. The
# last error line is usually one of these ("exiting"), while the line above it
# is the one that tells the operator what to do.
_CONSEQUENCE_MARKERS = ('exiting', 'systemd restarts', 'shutting down')

_DIAGNOSTIC_MARKERS = ('WARNING', 'ERROR', 'No camera', 'Failed', 'not authorized')


# OpenCV prints this to stderr when AVFoundation refuses the device. It is the
# one unambiguous signal that the failure is permission and not hardware.
_MACOS_DENIED_MARKER = 'not authorized to capture video'


def _launching_app():
    """The macOS app that owns this process tree, or None.

    macOS grants Camera access to the *responsible* app - the .app ancestor of
    the process that asks - not to Python. Naming it turns "grant access to
    your terminal" into an instruction the operator can actually follow.
    """
    if sys.platform != 'darwin':
        return None

    pid = os.getpid()
    for _ in range(12):  # bounded: a corrupt ppid chain must not loop forever
        try:
            out = subprocess.run(
                ['ps', '-o', 'ppid=,comm=', '-p', str(pid)],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
        except (subprocess.SubprocessError, OSError):
            return None
        if not out:
            return None

        parent, _, command = out.partition(' ')
        # Python itself lives in a .app inside its framework, so a naive scan
        # stops on the interpreter and reports "launched by Python", which
        # tells the operator nothing. Bundles nested in a .framework are always
        # helpers, never the app macOS holds responsible.
        if '.app/' in command and '.framework/' not in command:
            return command.split('.app/')[0].split('/')[-1]
        try:
            pid = int(parent)
        except ValueError:
            return None
        if pid <= 1:
            return None
    return None


def _permission_message():
    """What to do when macOS denied the camera without prompting.

    Terminal-launched Python gets a normal prompt. A process launched by an app
    with no camera entitlement does not: TCC logs "Policy disallows prompt" and
    denies outright, so nothing is ever added to the Privacy & Security list.
    Telling the operator to grant access there sends them looking for a
    checkbox that does not exist - the fix is to relaunch from a terminal.
    """
    app = _launching_app()
    launched_by = f'{app} ' if app else ''
    return (
        f'macOS denied camera access. The satellite was launched by {launched_by}'
        'which cannot show a camera prompt, so nothing appears under Privacy & '
        'Security to approve. Start the satellite from Terminal instead '
        '(cd yard/satellite && python3 web_server.py), press Start again, and '
        'approve the prompt macOS shows.'
    )


def _last_log_line():
    """The most ACTIONABLE line from a failed start.

    camera_server ends with "Failed to initialize camera, exiting", which is
    true but useless - and on a Mac it also mentions systemd, which does not
    exist there. The line above it carries the actual diagnosis and the fix
    (grant Camera access, or try another CAMERA_INDEX), so consequence lines
    are skipped in favour of it.
    """
    try:
        with open(DEV_LOG) as f:
            lines = [l.strip() for l in f if l.strip()]
    except OSError:
        return None

    # Checked before the generic scan: the log also carries a "No camera at
    # index N" line, which reads like a missing device and would send the
    # operator hunting for the wrong problem.
    if any(_MACOS_DENIED_MARKER in l for l in lines):
        return _permission_message()

    candidates = [l for l in lines if any(k in l for k in _DIAGNOSTIC_MARKERS)]
    if not candidates:
        return lines[-1] if lines else None

    diagnostic = [
        l for l in candidates
        if not any(m in l.lower() for m in _CONSEQUENCE_MARKERS)
    ]

    # Strip the logging prefix; the operator wants the sentence, not the level.
    best = (diagnostic or candidates)[-1]
    return best.split(' - ')[-1]


def start(camera_index=None):
    """Start the camera, or restart it if it is already running.

    Restart rather than start is the right default: the reason an operator
    reaches for this is almost always "the feed is wrong", and a stuck process
    holding the device is the usual cause.
    """
    if is_systemd_managed():
        return _run_systemctl('restart')
    return _spawn_dev(camera_index)


def stop():
    global _dev_process

    if is_systemd_managed():
        return _run_systemctl('stop')

    if _dev_process and _dev_process.poll() is None:
        _dev_process.terminate()
        try:
            _dev_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _dev_process.kill()
        return True, 'stopped'

    return False, 'no camera process started from this console'


def describe():
    """What the console needs to render the camera row."""
    managed = is_systemd_managed()
    return {
        'managedBy': 'systemd' if managed else 'process',
        'canControl': managed or _dev_process is not None or True,
        'running': is_listening(),
    }
