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

MISSIONS_COLLECTION = 'missions'
MISSION_LIST_LIMIT = 100

# Accepts standard watch URLs and short youtu.be links (mirrors what the
# learner-facing mission page can embed).
YOUTUBE_URL_PATTERNS = (
    re.compile(r'^https?://(www\.)?youtube\.com/watch\?v=[\w-]+'),
    re.compile(r'^https?://youtu\.be/[\w-]+'),
)

IDENTITY_TOOLKIT_SIGN_IN = (
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
)

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


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


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

def _mission_to_dict(doc):
    data = doc.to_dict() or {}
    return {
        'id': doc.id,
        'name': data.get('name'),
        'yardId': data.get('yardId'),
        'code': data.get('code') or '',
        'blocklyState': data.get('blocklyState'),
        'status': data.get('status'),
        'submittedAt': data.get('submittedAt'),
        'startedAt': data.get('startedAt'),
        'completedAt': data.get('completedAt'),
        'youtubeUrl': data.get('youtubeUrl'),
    }


@operator_bp.route('/api/missions', methods=['GET'])
@require_operator
def api_missions():
    if not _admin_configured():
        return jsonify({'error': 'Firestore is not configured'}), 503
    try:
        docs = (
            _firestore()
            .collection(MISSIONS_COLLECTION)
            # 'DESCENDING' is the value of firestore Query.DESCENDING; using the
            # string avoids importing google.cloud here.
            .order_by('submittedAt', direction='DESCENDING')
            .limit(MISSION_LIST_LIMIT)
            .stream()
        )
        missions = [_mission_to_dict(doc) for doc in docs]
    except Exception as e:
        return jsonify({'error': f'Failed to load missions: {e}'}), 502

    missions = [m for m in missions if m['status'] != 'cancelled']
    return jsonify({'missions': missions})


def _get_mission_ref(mission_id):
    ref = _firestore().collection(MISSIONS_COLLECTION).document(mission_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return None, None
    return ref, snapshot.to_dict() or {}


def _dispatch_to_rover(mission):
    """POST a mission's Python onto the rover queue.

    Returns (True, None) on success or (False, response) where response is a
    ready-to-return (json, status) tuple. Shared by send and rerun.
    """
    params = {'code': mission.get('code') or ''}
    if mission.get('blocklyState'):
        params['blockly_state'] = mission['blocklyState']

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
    """Push the mission's Python onto the rover queue; mission -> processing."""
    ref, mission = _get_mission_ref(mission_id)
    if ref is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') != 'queued':
        return jsonify({'error': 'Only queued missions can be sent to the rover'}), 400

    ok, err = _dispatch_to_rover(mission)
    if not ok:
        return err

    ref.update({'status': 'processing', 'startedAt': _now_iso()})
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/rerun', methods=['POST'])
@require_operator
def api_rerun(mission_id):
    """Re-queue a completed or failed mission on the rover.

    Clears the previous run's completion + video so the mission reflects the new
    run, not stale data from the last one.
    """
    ref, mission = _get_mission_ref(mission_id)
    if ref is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') not in ('completed', 'failed'):
        return jsonify({'error': 'Only completed or failed missions can be rerun'}), 400

    ok, err = _dispatch_to_rover(mission)
    if not ok:
        return err

    ref.update({
        'status': 'processing',
        'startedAt': _now_iso(),
        'completedAt': None,
        'youtubeUrl': None,
    })
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/complete', methods=['POST'])
@require_operator
def api_mark_complete(mission_id):
    ref, mission = _get_mission_ref(mission_id)
    if ref is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') not in ('queued', 'processing'):
        return jsonify({'error': 'Only queued or running missions can be marked complete'}), 400

    ref.update({'status': 'completed', 'completedAt': _now_iso()})
    return jsonify({'status': 'ok', 'missionId': mission_id})


@operator_bp.route('/api/missions/<mission_id>/youtube', methods=['POST'])
@require_operator
def api_attach_youtube(mission_id):
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url or not any(p.match(url) for p in YOUTUBE_URL_PATTERNS):
        return jsonify({'error': 'Use a youtube.com/watch?v=... or youtu.be/... URL'}), 400

    ref, mission = _get_mission_ref(mission_id)
    if ref is None:
        return jsonify({'error': 'Mission not found'}), 404
    if mission.get('status') != 'completed':
        return jsonify({'error': 'Attach the video after the mission is marked complete'}), 400

    ref.update({'youtubeUrl': url})
    return jsonify({'status': 'ok', 'missionId': mission_id})


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

                missions_ref.document(mission_id).update({'youtubeUrl': youtube_url})
                print(f'[youtube-poll] Linked mission {mission_id} to video {video_id}')
                break


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

