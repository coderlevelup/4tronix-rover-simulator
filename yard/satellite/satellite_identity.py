"""
Satellite identity - who this box is, for mission locking.

Plan reference: yard/docs/offline-sync-plan.md section 3.3.

Why this exists rather than using the operator's uid as the lock owner:

`OPERATOR_AUTH=off` is the event-day escape hatch, and it is not hypothetical -
it is what got 45 missions through on Mandela Day when the science centre wifi
could not sustain Firebase sign-in. In that mode `current_operator()` returns a
single shared stub whose uid is the literal string 'offline', so EVERY operator
is the same principal. The lock check `holder != owner` then never fires, two
tablets both acquire, and the rover runs the mission twice - the exact race the
lock was built to prevent, disabled in precisely the conditions it matters most.

The lock is about which *satellite* owns the rover, not which human is tapping.
One satellite owns one rover, so the satellite is the correct principal. This
also matches the plan's intent that leases are held by satellites, so a second
yard would contend correctly without any of this changing.
"""

import json
import os
import threading
import uuid

CONFIG_FILE = os.environ.get(
    'SATELLITE_CONFIG',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'satellite_config.json')
)

# Missions carry yardId; a satellite only ever manages its own yard's missions.
DEFAULT_YARD_ID = 'uct-rover-1'

_lock = threading.Lock()
_cached = {}


def _load():
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save(cfg):
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(cfg, f, indent=2)
    except Exception:
        # A read-only filesystem must not stop the satellite booting; the id
        # just won't survive a restart, which degrades lock ownership rather
        # than breaking it.
        pass


def satellite_id():
    """Stable UUID for this satellite, generated once on first boot.

    Used as `lockOwner` on missions. Persisted to satellite_config.json so a
    restart reclaims its own leases rather than looking like a different box.
    """
    with _lock:
        if 'satellite_id' in _cached:
            return _cached['satellite_id']

        cfg = _load()
        sat_id = cfg.get('satellite_id')

        if not sat_id:
            sat_id = str(uuid.uuid4())
            cfg['satellite_id'] = sat_id
            _save(cfg)

        _cached['satellite_id'] = sat_id
        return sat_id


def yard_id():
    """Which yard's missions this satellite manages.

    Configured, never generated: it has to match the `yardId` that
    mission-control stamps on missions, so a wrong value shows up as an empty
    queue rather than as silent cross-yard interference.
    """
    with _lock:
        if 'yard_id' in _cached:
            return _cached['yard_id']

        env_value = os.environ.get('YARD_ID')
        value = env_value or _load().get('yard_id') or DEFAULT_YARD_ID

        _cached['yard_id'] = value
        return value


def reset_cache():
    """Test hook - forget the memoised values."""
    with _lock:
        _cached.clear()
