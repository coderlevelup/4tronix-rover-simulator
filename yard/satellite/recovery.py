"""
Startup recovery - what to do about missions that were running when the
satellite stopped.

Plan reference: yard/docs/offline-sync-plan.md section 5 (PR 4).

If the satellite loses power mid-mission, the mirror is left holding a
'processing' row that this satellite owns. That state is genuinely ambiguous:
the rover may have completed the run, or it may have stopped halfway across the
yard. Nothing here guesses.

The governing rule is plan 2.3, never move the robot without a human. Recovery
may resolve a mission only when the ROVER itself confirms the outcome. Anything
else is surfaced for an operator to decide. It specifically must not:

  - re-dispatch (physical actions are not replayable), or
  - mark the mission failed (that asserts an outcome nobody established, and
    'failed' reaches the learner as a run that went wrong).
"""

import requests

from mission_store import find_interrupted, flag_for_review, resolve_review

ROVER_HISTORY_TIMEOUT = 3.0

REASON_INTERRUPTED = 'interrupted'


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _rover_completed(rover_url, mission_id):
    """Ask the rover whether it finished this mission.

    Returns True only on an explicit confirmation. Unreachable, malformed, or
    silent all return False, because "I could not tell" must never be read as
    "it finished" - that would mark a mission complete that never ran.
    """
    try:
        resp = requests.get(f'{rover_url}/queue/status', timeout=ROVER_HISTORY_TIMEOUT)
        if resp.status_code != 200:
            return False
        data = resp.json() or {}
    except (requests.exceptions.RequestException, ValueError):
        return False

    # The rover nests the id inside the instruction's params - that is where
    # _dispatch_to_rover puts it - not at the top level of the history entry.
    for entry in data.get('history') or []:
        if not isinstance(entry, dict):
            continue
        params = entry.get('params')
        if not isinstance(params, dict) or params.get('mission_id') != mission_id:
            continue
        return entry.get('status') == 'completed'

    return False


def recover_interrupted_missions(owner, rover_url=None):
    """Run once at startup. Returns (resolved, flagged) mission id lists.

    `rover_url` is optional: without it every interrupted mission goes straight
    to review, which is the safe outcome rather than a degraded one.
    """
    resolved, flagged = [], []

    for mission in find_interrupted(owner):
        mission_id = mission['id']

        if rover_url and _rover_completed(rover_url, mission_id):
            # The rover is the only authority that can settle this without a
            # human: it either ran the code to the end or it did not.
            resolve_review(mission_id, 'completed', _now_iso())
            resolved.append(mission_id)
            continue

        flag_for_review(mission_id, REASON_INTERRUPTED)
        flagged.append(mission_id)

    if resolved or flagged:
        print(
            f'[recovery] {len(resolved)} confirmed by the rover, '
            f'{len(flagged)} awaiting operator review'
        )

    return resolved, flagged
