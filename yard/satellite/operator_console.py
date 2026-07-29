"""
Operator Console - Flask blueprint for the yard operator interface

Mounted on the satellite web server at /operator/. Operators sign in with
their Firebase email/password (the account needs an 'operator' or 'admin'
custom claim), see the mission queue from Firestore, and send a mission's
Python straight to the rover queue with one tap. Mark-complete and the
YouTube link close the loop so learners see their run on the public site.

The public mission-control web app has no operator surface at all; this
console is the only operator UI and it lives on the yard's local network.

Configuration (environment):
  FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
      Service account for Firestore + token verification (same variable
      names as mission-control's .env, so one env file can feed both).
      GOOGLE_APPLICATION_CREDENTIALS (path to a JSON key) also works.
  FIREBASE_WEB_API_KEY (or NEXT_PUBLIC_FIREBASE_API_KEY)
      Web API key used for the email/password sign-in REST call.
  OPERATOR_SESSION_SECRET
      Optional. Stable Flask session secret; unset means sessions reset
      when the server restarts (operators just log in again).
  YOUTUBE_API_KEY / YOUTUBE_CHANNEL_ID
      Optional. Powers the background poll (start_polling/check_for_new_videos)
      that auto-links a completed mission to its YouTube upload by matching
      "MissionID: <id>" in the video description. Either unset disables the
      poll (it logs and no-ops) - manual "attach YouTube URL" still works
      without these.
  MISSION_CONTROL_URL
      Optional. Base URL of the mission-control web app, used to fire a
      best-effort POST /api/missions/<id>/notify after a status change so the
      learner gets a status email. This console remains fully functional
      (Firestore is still updated) if mission-control is unreachable or this
      is unset - the call is fire-and-forget. Defaults to
      http://localhost:3000.

The module file is named operator_console (not operator) so it does not
shadow Python's stdlib `operator` module.
"""

import os
import re
import requests
import threading
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Blueprint, current_app, jsonify, redirect, render_template, request, session

operator_bp = Blueprint('operator', __name__, url_prefix='/operator')

# Timeouts (seconds)
LOGIN_TIMEOUT = 10.0
ROVER_TIMEOUT = 5.0
NOTIFY_TIMEOUT = 10.0

MISSIONS_COLLECTION = 'missions'
# Upper bound on a single page of finished missions. Not a cap on what the
# console can reach - the client pages through - just a guard so a stray
# ?finished=999999 cannot make the satellite render the whole archive at once.
MAX_FINISHED_PAGE = 200

# Accepts standard watch URLs and short youtu.be links (mirrors what the
# learner-facing mission page can embed).
YOUTUBE_URL_PATTERNS = (
    re.compile(r'^https?://(www\.)?youtube\.com/watch\?v=[\w-]+'),
    re.compile(r'^https?://youtu\.be/[\w-]+'),
)

IDENTITY_TOOLKIT_SIGN_IN = (
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
)

# Active lease renewals: mission_id -> threading.Timer
_active_leases = {}

# Lazily initialised firebase_admin handles. Kept behind functions so tests
# can monkeypatch _firestore / _verify_id_token without firebase-admin or
# real credentials.
_firebase_app = None


def _web_api_key():
    return (
        os.environ.get('FIREBASE_WEB_API_KEY')
        or os.environ.get('NEXT_PUBLIC_FIREBASE_API_KEY')
    )


def _admin_configured():
    return bool(
        os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        or (
            os.environ.get('FIREBASE_PROJECT_ID')
            and os.environ.get('FIREBASE_CLIENT_EMAIL')
            and os.environ.get('FIREBASE_PRIVATE_KEY')
        )
    )


def _init_firebase():
    """Initialise firebase_admin once, from env credentials."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    import firebase_admin
    from firebase_admin import credentials

    if os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        cred = credentials.ApplicationDefault()
    else:
        # \n in the private key survives .env files as the two characters
        # backslash-n; decode them back to newlines (mission-control does the
        # same in its firebase-admin bootstrap).
        private_key = os.environ['FIREBASE_PRIVATE_KEY'].strip().strip('"').replace('\\n', '\n')
        cred = credentials.Certificate({
            'type': 'service_account',
            'project_id': os.environ['FIREBASE_PROJECT_ID'],
            'client_email': os.environ['FIREBASE_CLIENT_EMAIL'],
            'private_key': private_key,
            'token_uri': 'https://oauth2.googleapis.com/token',
        })

    _firebase_app = firebase_admin.initialize_app(cred, name='operator-console')
    return _firebase_app


def _firestore():
    from firebase_admin import firestore
    return firestore.client(app=_init_firebase())


def _verify_id_token(id_token):
    from firebase_admin import auth
    return auth.verify_id_token(id_token, app=_init_firebase())


def _rover_url():
    getter = current_app.config.get('ROVER_URL_GETTER')
    return getter() if getter else os.environ.get('ROVER_URL', 'http://marspi.local:8523')


def _mission_control_url():
    getter = current_app.config.get('MISSION_CONTROL_URL_GETTER')
    return getter() if getter else os.environ.get('MISSION_CONTROL_URL', 'http://localhost:3000')


def _notify_mission_control(mission_id, status):
    """Best-effort status-email trigger, called after Firestore is already
    updated. Must never raise - a learner missing an email is far cheaper
    than an operator unable to run the rover because mission-control happens
    to be down.
    """
    try:
        requests.post(
            f'{_mission_control_url()}/api/missions/{mission_id}/notify',
            json={'status': status},
            timeout=NOTIFY_TIMEOUT,
        )
    except requests.exceptions.RequestException:
        current_app.logger.warning(
            'Failed to notify mission-control of status change (mission=%s, status=%s)',
            mission_id, status,
        )


def _notify_mission_control_async(mission_id, status):
    """Fire _notify_mission_control on a background thread so a slow or
    unreachable mission-control - a Cloud Run cold start, or the venue wifi
    the operator console already has to tolerate - never delays the
    operator's response. The rover dispatch / Firestore write this follows
    has already succeeded by the time this is called.

    Flask's app context is thread-local and does not propagate to new
    threads automatically, so it's captured here (while still on the
    request's thread) and re-pushed inside the background thread.
    """
    app = current_app._get_current_object()

    def run():
        with app.app_context():
            _notify_mission_control(mission_id, status)

    threading.Thread(target=run, daemon=True).start()


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def _expires_iso():
    from datetime import timedelta
    return (datetime.now(timezone.utc) + timedelta(seconds=LEASE_TTL_SECONDS)).isoformat().replace('+00:00', 'Z')

LEASE_RENEW_INTERVAL = 60  # seconds


def _start_lease_renewal(mission_id):
    """Keep the lease alive locally while a mission runs.

    Mirror-only by design: a renewal carries no new information for Firestore
    (the lease is re-sent with the next real status change), and queueing one
    every 60 seconds would fill the outbox with entries that mean nothing.
    """
    def _renew():
        try:
            from mission_store import renew_lease
            renew_lease(mission_id, _expires_iso(), _now_iso())
        except Exception as e:
            print(f'[lease] Failed to renew lease for {mission_id}: {e}')

        timer = threading.Timer(LEASE_RENEW_INTERVAL, _renew)
        timer.daemon = True
        _active_leases[mission_id] = timer
        timer.start()

    timer = threading.Timer(LEASE_RENEW_INTERVAL, _renew)
    timer.daemon = True
    _active_leases[mission_id] = timer
    timer.start()


def _stop_lease_renewal(mission_id):
    """Cancel the renewal timer for a mission."""
    timer = _active_leases.pop(mission_id, None)
    if timer:
        timer.cancel()



# Event-day escape hatch: OPERATOR_AUTH=off skips login entirely. Firebase
# sign-in needs internet, and venue wifi (science centre) can be too flaky to
# get operators through the front door. The satellite only serves the yard's
# own network, so open access for a day is an accepted trade. Unset the
# variable to restore normal auth.
OFFLINE_OPERATOR = {'uid': 'offline', 'email': 'offline operator', 'role': 'operator'}


def auth_disabled():
    return os.environ.get('OPERATOR_AUTH', '').strip().lower() in ('off', 'disabled', '0', 'false')


def current_operator():
    """The signed-in operator, or the offline stub when auth is disabled."""
    operator = session.get('operator')
    if operator:
        return operator
    return OFFLINE_OPERATOR if auth_disabled() else None


def require_operator(f):
    """API guard: 401 JSON unless an operator session exists (or auth is off)."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_operator():
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@operator_bp.route('/')
def console():
    operator = current_operator()
    if not operator:
        return redirect('/operator/login')
    return render_template('operator.html', operator=operator)


@operator_bp.route('/login')
def login_page():
    if current_operator():
        return redirect('/')
    return render_template(
        'operator_login.html',
        configured=bool(_web_api_key() and _admin_configured()),
    )


# ---------------------------------------------------------------------------
# Auth API
# ---------------------------------------------------------------------------

@operator_bp.route('/api/login', methods=['POST'])
def api_login():
    if not (_web_api_key() and _admin_configured()):
        return jsonify({'error': 'Operator console is not configured (Firebase credentials missing)'}), 503

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        resp = requests.post(
            IDENTITY_TOOLKIT_SIGN_IN,
            params={'key': _web_api_key()},
            json={'email': email, 'password': password, 'returnSecureToken': True},
            timeout=LOGIN_TIMEOUT,
        )
    except requests.exceptions.RequestException:
        return jsonify({'error': 'Could not reach the sign-in service (no internet?)'}), 502

    if resp.status_code != 200:
        return jsonify({'error': 'Invalid email or password'}), 401

    try:
        claims = _verify_id_token(resp.json()['idToken'])
    except Exception:
        return jsonify({
            'error': 'Could not verify the sign-in token. Check that the satellite and '
                     'the web app use the same Firebase project (matching FIREBASE_* env).'
        }), 401

    role = claims.get('role')
    if role not in ('operator', 'admin'):
        return jsonify({'error': 'This account does not have operator access'}), 403

    session['operator'] = {
        'uid': claims.get('user_id') or claims.get('sub'),
        'email': claims.get('email') or email,
        'role': role,
    }
    return jsonify({'status': 'ok', 'role': role})


@operator_bp.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('operator', None)
    return jsonify({'status': 'ok'})


# ---------------------------------------------------------------------------
# Missions API
# ---------------------------------------------------------------------------

def _mirror_row_to_dict(row):
    """Map a mission_mirror SQLite row (snake_case) to the API's camelCase
    shape - the frontend (operator.html) contract predates the mirror and is
    unchanged by it.
    """
    return {
        'id': row['id'],
        'name': row.get('name'),
        'yardId': row.get('yard_id'),
        'code': row.get('code') or '',
        'blocklyState': row.get('blockly_state'),
        'status': row.get('status'),
        'submittedAt': row.get('submitted_at'),
        'startedAt': row.get('started_at'),
        'completedAt': row.get('completed_at'),
        'youtubeUrl': row.get('youtube_url'),
        'deleted': bool(row.get('deleted')),
    }


def _mirror_is_stale(last_synced_at):
    """Stale if we've never synced, or the last pull was over 60s ago."""
    if not last_synced_at:
        return True
    synced_time = datetime.fromisoformat(last_synced_at.replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - synced_time).total_seconds()
    return age > 60


@operator_bp.route('/api/missions', methods=['GET'])
@require_operator
def api_missions():
    from mission_store import get_missions, outbox_count, DEFAULT_FINISHED_PAGE
    from satellite_identity import yard_id

    # Scoped to this satellite's own yard (plan 3.3) so a second yard's
    # missions can never appear in, or be dispatched from, this console.
    # `finished` is how many completed/failed missions to include. Actionable
    # missions are always returned in full regardless of it, so paging can
    # never hide work an operator still has to do.
    try:
        finished = int(request.args.get('finished', DEFAULT_FINISHED_PAGE))
    except ValueError:
        finished = DEFAULT_FINISHED_PAGE
    finished = max(1, min(finished, MAX_FINISHED_PAGE))

    rows, last_synced, finished_total = get_missions(finished, yard_id=yard_id())

    return jsonify({
        'missions': [_mirror_row_to_dict(row) for row in rows],
        'stale': _mirror_is_stale(last_synced),
        'lastSyncedAt': last_synced,
        'pendingWrites': outbox_count(),
        'finishedShown': min(finished, finished_total),
        'finishedTotal': finished_total,
    })



def _get_mission_ref(mission_id):
    ref = _firestore().collection(MISSIONS_COLLECTION).document(mission_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return None, None
    return ref, snapshot.to_dict() or {}

_acquire_lock = threading.Lock()
LEASE_TTL_SECONDS = 300  # 5 minutes

def _transactional(fn):
    """Apply firebase-admin's @firestore.transactional lazily.

    Everything firebase-admin in this module is imported inside functions, so
    the kiosk pages and the test-suite work without the package or real
    credentials present (see _init_firebase / _firestore). A module-level
    `@firestore.transactional` breaks that contract - and in fact breaks
    importing this module at all, because `firestore` is not a module-level
    name here. Wrapping at call time keeps the lazy design intact.
    """
    from firebase_admin import firestore
    return firestore.transactional(fn)


def _acquire(transaction, ref, owner, now_iso, expires_iso):
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return False, 'not-found', None
    data = snap.to_dict() or {}

    status = data.get('status')
    holder = data.get('lockOwner')
    lease = data.get('leaseExpiresAt')
    lease_live = bool(lease) and lease > now_iso

    # A 'processing' mission whose lease has EXPIRED is abandoned: the operator
    # that held it crashed, closed the tab, or lost the venue wifi, and the
    # in-process renewal timer died with it. Reclaiming it is the entire point
    # of having a lease - without this, an expired lease leaves the mission
    # stuck in 'processing' forever, rejected by send (not-queued) and by rerun
    # (not-terminal), recoverable only by hand-editing Firestore.
    #
    # A mission with NO lease at all is deliberately NOT reclaimable. Every path
    # that sets 'processing' also sets a lease, so no-lease means legacy data
    # written before this feature. Treating that as free to grab would let two
    # operators drive the same mission, so those are left to be unstuck
    # deliberately rather than silently re-dispatched.
    reclaimable = status == 'processing' and bool(lease) and not lease_live

    if status != 'queued' and not reclaimable:
        return False, 'not-queued', None

    if holder and holder != owner and lease_live:
        return False, 'locked-by-other', None

    transaction.update(ref, {
        'status': 'processing',
        'startedAt': now_iso,
        'statusUpdatedAt': now_iso,
        'lockOwner': owner,
        'lockedAt': now_iso,
        'leaseExpiresAt': expires_iso,
    })
    # Returns the pre-update snapshot so the caller has the mission's code to
    # dispatch, matching _acquire_for_rerun's shape.
    return True, None, data



def _dispatch_to_rover(mission, mission_id=None):
    """POST a mission's Python onto the rover queue.

    Returns (True, None) on success or (False, response) where response is a
    ready-to-return (json, status) tuple. Shared by send and rerun.
    """
    params = {'code': mission.get('code') or ''}
    if mission.get('blocklyState'):
        params['blockly_state'] = mission['blocklyState']
    if mission_id:
        params['mission_id'] = mission_id

    try:
        resp = requests.post(
            f'{_rover_url()}/queue/add',
            json=[{'cmd': 'run_python', 'params': params}],
            timeout=ROVER_TIMEOUT,
        )
    except requests.exceptions.RequestException:
        return False, (jsonify({'error': 'Cannot connect to rover server'}), 503)

    if resp.status_code != 200:
        return False, (jsonify({'error': f'Rover queue rejected the mission (HTTP {resp.status_code})'}), 502)

    return True, None


@operator_bp.route('/api/missions/<mission_id>/send', methods=['POST'])
@require_operator
def api_send_to_rover(mission_id):
    """Claim the mission locally, then push its Python onto the rover queue.

    Firestore is deliberately NOT touched here (plan PR 3): the request path
    runs entirely off SQLite so the console keeps working with no internet, and
    the sync worker is the only thing that talks to Firestore. The lock is
    still atomic - acquire_mission uses BEGIN IMMEDIATE - so two simultaneous
    taps still produce exactly one dispatch.
    """
    from mission_store import acquire_mission, release_mission
    from satellite_identity import satellite_id

    owner = satellite_id()
    now = _now_iso()
    expires = _expires_iso()

    # The SQLite transaction serialises across processes; this serialises the
    # rover dispatch that follows it within this process.
    with _acquire_lock:
        ok, reason, mission = acquire_mission(mission_id, owner, now, expires)

    if not ok:
        messages = {
            'not-found': ('Mission not found', 404),
            'not-queued': ('Only queued missions can be sent to the rover', 400),
            'locked-by-other': ('Mission is locked by another operator', 409),
        }
        msg, code = messages.get(reason, ('Lock failed', 500))
        return jsonify({'error': msg}), code

    ok, err = _dispatch_to_rover(_mirror_row_to_dict(mission), mission_id=mission_id)
    if not ok:
        # Nothing reached the rover, so put it back rather than holding the
        # lock for a full lease period.
        release_mission(mission_id, 'queued', _now_iso())
        return err

    _start_lease_renewal(mission_id)
    _notify_mission_control_async(mission_id, 'processing')
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/rerun', methods=['POST'])
@require_operator
def api_rerun(mission_id):
    """Re-run a finished mission. Clears the previous run's completion and
    video so the mission reflects the new run, not stale data."""
    from mission_store import acquire_mission, release_mission
    from satellite_identity import satellite_id

    owner = satellite_id()
    now = _now_iso()
    expires = _expires_iso()

    with _acquire_lock:
        ok, reason, mission = acquire_mission(mission_id, owner, now, expires, for_rerun=True)

    previous_status = (mission or {}).get('status', 'completed')

    if not ok:
        messages = {
            'not-found': ('Mission not found', 404),
            'not-terminal': ('Only completed or failed missions can be rerun', 400),
            'locked-by-other': ('Mission is locked by another operator', 409),
        }
        msg, code = messages.get(reason, ('Lock failed', 500))
        return jsonify({'error': msg}), code

    ok, err = _dispatch_to_rover(_mirror_row_to_dict(mission), mission_id=mission_id)
    if not ok:
        # Nothing ran, so restore what the mission was before the lock. Marking
        # it 'failed' would misreport an unreachable rover as a failed run, and
        # 'failed' reaches the learner as a run that went wrong.
        release_mission(mission_id, previous_status, _now_iso())
        return err

    _start_lease_renewal(mission_id)
    _notify_mission_control_async(mission_id, 'processing')
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/complete', methods=['POST'])
@require_operator
def api_mark_complete(mission_id):
    from mission_store import get_mission, release_mission

    mission = get_mission(mission_id)
    if mission is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') not in ('queued', 'processing'):
        return jsonify({'error': 'Only queued or running missions can be marked complete'}), 400

    _stop_lease_renewal(mission_id)
    release_mission(mission_id, 'completed', _now_iso())
    _notify_mission_control_async(mission_id, 'completed')
    return jsonify({'status': 'ok', 'missionId': mission_id})



@operator_bp.route('/api/missions/<mission_id>/youtube', methods=['POST'])
@require_operator
def api_attach_youtube(mission_id):
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url or not any(p.match(url) for p in YOUTUBE_URL_PATTERNS):
        return jsonify({'error': 'Use a youtube.com/watch?v=... or youtu.be/... URL'}), 400

    from mission_store import get_mission, set_mission_field

    mission = get_mission(mission_id)
    if mission is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') != 'completed':
        return jsonify({'error': 'Attach the video after the mission is marked complete'}), 400

    set_mission_field(mission_id, {'youtube_url': url}, {'youtubeUrl': url})
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/cancel', methods=['POST'])
@require_operator
def api_cancel_mission(mission_id):
    """Take a mission out of the queue without running it.

    The gap this fills: a learner submits a duplicate, or code that is never
    going to do anything, and today the only options are run it or leave it in
    the queue forever.

    Cancel rather than delete, deliberately. The mission is a child's work and
    the record of it should survive; 'cancelled' also reads as "Pending" on the
    learner's side (discoveryStatus.ts), so nobody is shown a rejection.
    """
    from mission_store import get_mission, release_mission

    mission = get_mission(mission_id)
    if mission is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') not in ('queued', 'processing'):
        return jsonify({'error': 'Only queued or running missions can be cancelled'}), 400

    _stop_lease_renewal(mission_id)
    release_mission(mission_id, 'cancelled', _now_iso())
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/camera/start', methods=['POST'])
@require_operator
def api_camera_start():
    """Start (or restart) the camera server.

    Behind require_operator deliberately. Spawning a process is the most
    powerful thing this console can do, and it sits on a network anyone at the
    venue can join. The command itself is hardcoded - see camera_control - so
    nothing from this request reaches a shell; the auth gate is defence in
    depth rather than the only control.

    An optional camera index is accepted and validated as an integer. It is the
    device selector on a development machine, the analogue of the rover URL.
    """
    from camera_control import start

    data = request.get_json(silent=True) or {}
    index = data.get('cameraIndex')
    if index is not None:
        try:
            index = int(index)
        except (TypeError, ValueError):
            return jsonify({'error': 'cameraIndex must be a number'}), 400
        if not 0 <= index <= 15:
            return jsonify({'error': 'cameraIndex must be between 0 and 15'}), 400
        _persist_camera_index(index)

    ok, detail = start(camera_index=index)
    if not ok:
        return jsonify({'error': detail}), 502

    # The server needs a moment to bind, so the caller polls /api/camera
    # rather than this reporting a readiness it cannot yet know.
    return jsonify({'status': 'ok', 'detail': detail})


@operator_bp.route('/api/camera/stop', methods=['POST'])
@require_operator
def api_camera_stop():
    from camera_control import stop

    ok, detail = stop()
    if not ok:
        return jsonify({'error': detail}), 502
    return jsonify({'status': 'ok', 'detail': detail})


def _persist_camera_index(index):
    """Remember the device across restarts, like the rover URL."""
    try:
        from satellite_identity import CONFIG_FILE
        import json
        try:
            with open(CONFIG_FILE) as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
        cfg['camera_index'] = index
        with open(CONFIG_FILE, 'w') as f:
            json.dump(cfg, f, indent=2)
        os.environ['CAMERA_INDEX'] = str(index)
    except (OSError, ValueError, ImportError) as e:
        # Best effort: the index still applies to the start about to happen,
        # it just will not survive a restart. Logged rather than swallowed so
        # a read-only config file is not invisible.
        print(f'could not persist camera_index: {e}')


@operator_bp.route('/api/camera', methods=['GET'])
@require_operator
def api_camera_status():
    """Whether the camera feed is up, and which backend is serving it.

    The backend matters to an operator: on the Pi the IMX500 does object
    detection on its own NPU, whereas a laptop webcam is a plain feed. Showing
    'no detection' beats someone concluding detection is broken.
    """
    port = int(os.environ.get('CAMERA_PORT', 8890))
    host = os.environ.get('CAMERA_HOST', 'localhost')

    import socket
    reachable = False
    try:
        with socket.create_connection((host, port), timeout=1.0):
            reachable = True
    except OSError:
        pass

    try:
        from camera_control import describe
        control = describe()
    except Exception:
        control = {'managedBy': 'unknown', 'running': reachable}

    return jsonify({
        'reachable': reachable,
        'host': host,
        'port': port,
        'wsUrl': f'ws://{host}:{port}',
        'managedBy': control.get('managedBy'),
        'cameraIndex': int(os.environ.get('CAMERA_INDEX', 0)),
        'hint': None if reachable else (
            'Camera server is not running. Use Start below. On a Mac it uses '
            'the built-in webcam (no object detection) and needs Camera '
            'permission; press Start and the message will say what to do.'
        ),
    })


@operator_bp.route('/api/missions/<mission_id>/delete', methods=['POST'])
@require_operator
def api_delete_mission(mission_id):
    """Remove a mission from the platform.

    Soft-delete underneath (see mission_store.delete_mission): the console
    offers no undo, so the operator is warned it is permanent, but the record
    survives for someone with database access. That asymmetry is deliberate -
    the warning has to be honest about what the OPERATOR can undo, which is
    nothing, while a mis-tap on a child's completed mission should still be
    recoverable by a human who can reach the database.

    Cancel is the reversible option and stays the default for "not going to
    run this". Delete is for a mission that should not exist at all.
    """
    from mission_store import get_mission, delete_mission

    mission = get_mission(mission_id, include_deleted=True)
    if mission is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('deleted'):
        return jsonify({'error': 'This mission is already deleted'}), 400

    _stop_lease_renewal(mission_id)
    delete_mission(mission_id, _now_iso())
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/integrations', methods=['GET'])
@require_operator
def api_integrations():
    """Which integrations are configured - never their values.

    Deliberately read-only. Letting an operator paste API keys into this console
    would be a security regression: it is reachable by anyone on the venue
    network and OPERATOR_AUTH=off removes the login entirely on event days. The
    real need behind "let me configure it here" is "tell me whether it's set up",
    which this answers without putting a secret on a screen.
    """
    def state(configured, detail):
        return {'configured': bool(configured), 'detail': detail}

    yt_key = bool(_youtube_api_key())
    yt_channel = bool(_youtube_channel_id())

    return jsonify({
        'integrations': [
            {
                'id': 'firestore',
                'name': 'Firestore',
                'why': 'Syncs missions with mission-control.',
                **state(_admin_configured(),
                        'Service account present' if _admin_configured()
                        else 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY'),
            },
            {
                'id': 'youtube',
                'name': 'YouTube auto-link',
                'why': 'Finds uploaded videos by the MissionID in their description.',
                **state(yt_key and yt_channel,
                        'Key and channel set' if yt_key and yt_channel
                        else 'Set YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID (manual linking still works)'),
            },
            {
                'id': 'mission_control',
                'name': 'Mission Control',
                'why': 'Receives status changes so learners get their emails.',
                **state(True, _mission_control_url()),
            },
        ],
    })


@operator_bp.route('/api/missions/needs-review', methods=['GET'])
@require_operator
def api_needs_review():
    """Missions that were running when the satellite stopped.

    Surfaced as a distinct group rather than mixed into the queue: they are
    ambiguous, not queued, and an operator has to decide what happened.
    """
    from mission_store import get_needs_review

    return jsonify({
        'missions': [_mirror_row_to_dict(row) for row in get_needs_review()],
    })


@operator_bp.route('/api/missions/<mission_id>/resolve', methods=['POST'])
@require_operator
def api_resolve_review(mission_id):
    """Record the operator's decision about an interrupted mission.

    'completed' - they checked and the run finished.
    'requeue'   - put it back in the queue to be run again.

    Deliberately does NOT dispatch to the rover. Re-queuing makes the mission
    available for a human to send again; it never moves the robot by itself
    (plan 2.3).
    """
    from mission_store import get_mission, resolve_review

    data = request.get_json(silent=True) or {}
    outcome = (data.get('outcome') or '').strip()
    if outcome not in ('completed', 'requeue'):
        return jsonify({'error': "outcome must be 'completed' or 'requeue'"}), 400

    mission = get_mission(mission_id)
    if mission is None:
        return jsonify({'error': 'Mission not found'}), 404
    if not mission.get('needs_review'):
        return jsonify({'error': 'This mission is not awaiting review'}), 400

    status = 'completed' if outcome == 'completed' else 'queued'
    _stop_lease_renewal(mission_id)
    resolve_review(mission_id, status, _now_iso())

    if status == 'completed':
        _notify_mission_control_async(mission_id, 'completed')

    return jsonify({'status': 'ok', 'missionId': mission_id, 'newStatus': status})


@operator_bp.route('/api/conflicts', methods=['GET'])
@require_operator
def api_conflicts():
    """Merges where the losing side was already terminal, so the team can see
    that reconciliation made a real decision rather than silently picking."""
    from mission_store import get_conflicts

    return jsonify({'conflicts': get_conflicts()})


@operator_bp.route('/api/health', methods=['GET'])
@require_operator
def api_rover_health():
    """Rover reachability for the console badge. Degraded queue = down."""
    result = {'rover_url': _rover_url(), 'reachable': False}
    try:
        resp = requests.get(f'{_rover_url()}/health', timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            result['reachable'] = data.get('status') == 'ok'
            result['driver'] = data.get('driver')
            result['queue_size'] = data.get('queue_size')
    except requests.exceptions.RequestException:
        pass
    return jsonify(result)

# YouTube video fetching implementation

def _youtube_api_key():
    return os.environ.get('YOUTUBE_API_KEY')


def _youtube_channel_id():
    return os.environ.get('YOUTUBE_CHANNEL_ID')


def check_for_new_videos():
    """Poll the YouTube channel for uploads matching a completed mission's ID.

    A mission never has a `youtubeUrl` field at all until one is attached
    (mission-control omits it entirely on write; only api_rerun explicitly
    nulls it out), so this cannot filter on `youtubeUrl == None` in the
    Firestore query itself - that only matches documents where the field is
    present and null, not documents where it's absent. Fetch completed
    missions and filter for a missing/falsy youtubeUrl in Python instead.
    """
    print('[youtube-poll] Checking for new videos...')

    api_key = _youtube_api_key()
    channel_id = _youtube_channel_id()
    if not api_key or not channel_id:
        print('[youtube-poll] Missing YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID; skipping poll')
        return

    try:
        missions_ref = _firestore().collection(MISSIONS_COLLECTION)
        completed = list(missions_ref.where('status', '==', 'completed').stream())
    except Exception as e:
        print(f'[youtube-poll] Failed to read Firestore: {e}')
        return

    unlinked = [doc for doc in completed if not doc.to_dict().get('youtubeUrl')]
    if not unlinked:
        return

    # The uploads playlist id is the channel id with UC -> UU.
    uploads_playlist = channel_id.replace('UC', 'UU', 1)

    try:
        response = requests.get(
            'https://www.googleapis.com/youtube/v3/playlistItems',
            params={
                'part': 'snippet',
                'playlistId': uploads_playlist,
                'maxResults': 50,
                'key': api_key,
            },
            timeout=10.0,
        )
    except requests.exceptions.RequestException as e:
        print(f'[youtube-poll] Could not reach the YouTube API: {e}')
        return

    if response.status_code != 200:
        print(f'[youtube-poll] YouTube API error: HTTP {response.status_code}')
        return

    videos = response.json().get('items', [])

    # Match mission ids embedded in video descriptions.
    for mission_doc in unlinked:
        mission_id = mission_doc.id

        for video in videos:
            description = video.get('snippet', {}).get('description', '')

            if f'MissionID: {mission_id}' in description:
                video_id = video.get('snippet', {}).get('resourceId', {}).get('videoId')
                if not video_id:
                    continue
                youtube_url = f'https://www.youtube.com/watch?v={video_id}'

                # Plan 7.5: this poll writes to Firestore directly rather than
                # through the outbox (it only runs online anyway, since it needs
                # the YouTube API). Skip any mission with a pending local write,
                # or this would land between the flush's read and write and be
                # clobbered - or clobber it.
                if _has_pending_writes(mission_id):
                    print(f'[youtube-poll] Skipping {mission_id}: local writes pending')
                    break

                missions_ref.document(mission_id).update({'youtubeUrl': youtube_url})
                _mirror_youtube_url(mission_id, youtube_url)
                print(f'[youtube-poll] Linked mission {mission_id} to video {video_id}')
                break


def _has_pending_writes(mission_id):
    """True if the outbox still holds an unflushed change for this mission."""
    try:
        from mission_store import mission_has_pending
        return mission_has_pending(mission_id)
    except Exception:
        # If we cannot tell, assume there are: skipping one poll cycle is
        # cheaper than racing a flush.
        return True


def _mirror_youtube_url(mission_id, url):
    """Keep the mirror in step with a direct Firestore write, so the console
    shows the link without waiting for the next pull."""
    try:
        from mission_store import set_mirror_only
        set_mirror_only(mission_id, {'youtube_url': url})
    except Exception:
        pass


def start_polling():
    """Run check_for_new_videos every 5 minutes.

    A bad poll (Firestore hiccup, YouTube API down, anything unexpected)
    must never stop the loop - the reschedule always has to run, or the
    feature silently dies until the satellite is restarted.
    """
    try:
        check_for_new_videos()
    except Exception as e:
        print(f'[youtube-poll] Unexpected error during poll: {e}')

    timer = threading.Timer(300, start_polling)
    timer.daemon = True
    timer.start()

