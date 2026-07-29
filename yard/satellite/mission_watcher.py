"""
Mission watcher - closes the loop the operator currently closes by hand.

Today a mission sits in 'processing' until someone taps "Mark complete". The
rover already knows it finished: RoverService sets status='completed' on the
instruction and keeps it in its history, and since PR 1 the dispatch carries
mission_id. Nothing ever asks.

On a busy event day that gap is the whole problem - an operator turns to the
next child, forgets, and the mission is stuck in 'processing' forever. Worse,
it holds the lease, so nothing else can reclaim it either.

This polls the rover and completes the missions the rover CONFIRMS it ran.

Why this is allowed under plan 2.3 ("never move the robot without a human"):
that rule forbids automatically DISPATCHING, because a physical action cannot
be replayed. Recording an outcome the rover already reported moves nothing. The
watcher never sends anything to the rover - it only reads /queue/status.

It is deliberately one-directional: it can complete a mission, never fail one.
An error on the rover leaves the mission alone for a human to look at, because
"the code raised" is not the same as "the run was a failure", and a learner must
never be shown a failed mission (see mission-control's discoveryStatus.ts).
"""

import threading

import requests

from mission_store import get_mission, release_mission, mission_has_pending

ROVER_POLL_TIMEOUT = 3.0
DEFAULT_POLL_INTERVAL = 10  # seconds


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def completed_mission_ids(rover_url):
    """Mission ids the rover reports as completed, from its own history.

    Returns an empty set on any failure. Never raises: an unreachable rover
    must not stop the watcher, and "I could not tell" must never be read as
    "it finished".
    """
    try:
        resp = requests.get(f'{rover_url}/queue/status', timeout=ROVER_POLL_TIMEOUT)
        if resp.status_code != 200:
            return set()
        data = resp.json() or {}
    except (requests.exceptions.RequestException, ValueError):
        return set()

    done = set()
    for entry in data.get('history') or []:
        if not isinstance(entry, dict) or entry.get('status') != 'completed':
            continue
        params = entry.get('params')
        if isinstance(params, dict) and params.get('mission_id'):
            done.add(params['mission_id'])
    return done


def autocomplete_finished_missions(rover_url, notify=None):
    """Complete any 'processing' mission the rover says it finished.

    `notify` is the mission-control status callback, injected so this module
    does not import the Flask blueprint (which would be a circular import and
    would drag an app context into a background thread).

    Returns the list of mission ids completed.
    """
    completed = []

    for mission_id in completed_mission_ids(rover_url):
        mission = get_mission(mission_id)
        if mission is None or mission.get('status') != 'processing':
            continue
        # A mission awaiting a human decision is theirs to resolve, not ours.
        if mission.get('needs_review'):
            continue
        # Do not race a flush that is already carrying a change for this row.
        if mission_has_pending(mission_id):
            continue

        release_mission(mission_id, 'completed', _now_iso())
        completed.append(mission_id)
        print(f'[watcher] Rover confirmed {mission_id}; marked complete')

        if notify:
            try:
                notify(mission_id, 'completed')
            except Exception as e:
                print(f'[watcher] Notify failed for {mission_id}: {e}')

    return completed


def start_mission_watcher(rover_url_getter, notify=None, interval=DEFAULT_POLL_INTERVAL):
    """Poll on a background timer.

    Takes a getter for the rover URL because it is editable at runtime from the
    /status page, so capturing the value once would leave the watcher polling a
    stale address after an operator corrects it.
    """
    def _loop():
        try:
            url = rover_url_getter() if callable(rover_url_getter) else rover_url_getter
            if url:
                autocomplete_finished_missions(url, notify=notify)
        except Exception as e:
            print(f'[watcher] Unexpected error: {e}')

        timer = threading.Timer(interval, _loop)
        timer.daemon = True
        timer.start()

    _loop()
