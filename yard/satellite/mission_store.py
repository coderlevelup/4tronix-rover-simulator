import json
import os
import sqlite3
import threading
import uuid as uuid_mod
from datetime import datetime, timezone

DB_PATH = os.environ.get('MISSION_MIRROR_DB', 'missions.db')

# Finished missions are paged rather than capped. This is only a page size:
# the console asks for more as the operator scrolls, and it all comes from
# local SQLite, so a larger page costs DOM nodes and nothing else.
DEFAULT_FINISHED_PAGE = 40
_db_lock = threading.Lock()


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create the tables if they don't exist."""
    with _db_lock:
        conn = _connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS mission_mirror (
                id                TEXT PRIMARY KEY,
                name              TEXT,
                yard_id           TEXT,
                code              TEXT,
                blockly_state     TEXT,
                status            TEXT NOT NULL,
                submitted_at      TEXT,
                started_at        TEXT,
                completed_at      TEXT,
                youtube_url       TEXT,
                lock_owner        TEXT,
                locked_at         TEXT,
                lease_expires_at  TEXT,
                needs_review      INTEGER DEFAULT 0,
                review_reason     TEXT,
                status_updated_at TEXT,
                deleted           INTEGER DEFAULT 0,
                deleted_at        TEXT,
                synced_at         TEXT,
                local_dirty       INTEGER DEFAULT 0
            );

            -- Write queue: local changes not yet accepted by Firestore. Unused
            -- until PR 3 (outbox + push-before-pull sync), but the schema
            -- lands now so the mirror doesn't need a second migration.
            CREATE TABLE IF NOT EXISTS outbox (
                seq        INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid       TEXT UNIQUE NOT NULL,
                mission_id TEXT NOT NULL,
                op         TEXT NOT NULL,
                payload    TEXT NOT NULL,
                event_at   TEXT NOT NULL,
                attempts   INTEGER DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS conflict_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                mission_id   TEXT NOT NULL,
                local_state  TEXT NOT NULL,
                remote_state TEXT NOT NULL,
                resolution   TEXT NOT NULL,
                logged_at    TEXT NOT NULL
            );
        """)
        _migrate(conn)
        conn.commit()
        conn.close()


# Columns added after the first release, with the type to add them as. init_db
# runs this every boot so a satellite that already has a mirror on disk from an
# earlier version picks them up instead of failing on the first write.
_ADDED_COLUMNS = {
    'mission_mirror': {
        'locked_at': 'TEXT',
        'deleted': 'INTEGER DEFAULT 0',
        'deleted_at': 'TEXT',
    },
}


def _migrate(conn):
    for table, columns in _ADDED_COLUMNS.items():
        existing = {r['name'] for r in conn.execute(f'PRAGMA table_info({table})')}
        for name, coltype in columns.items():
            if name not in existing:
                conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {coltype}')


def upsert_missions(missions, synced_at):
    """Write a batch of missions from Firestore into the mirror."""
    with _db_lock:
        conn = _connect()
        for m in missions:
            conn.execute("""
                INSERT INTO mission_mirror
                    (id, name, yard_id, code, blockly_state, status,
                     submitted_at, started_at, completed_at, youtube_url,
                     lock_owner, locked_at, lease_expires_at, needs_review,
                     review_reason, status_updated_at, deleted, deleted_at,
                     synced_at, local_dirty)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    yard_id=excluded.yard_id,
                    code=excluded.code,
                    blockly_state=excluded.blockly_state,
                    status=excluded.status,
                    submitted_at=excluded.submitted_at,
                    started_at=excluded.started_at,
                    completed_at=excluded.completed_at,
                    youtube_url=excluded.youtube_url,
                    lock_owner=excluded.lock_owner,
                    locked_at=excluded.locked_at,
                    lease_expires_at=excluded.lease_expires_at,
                    needs_review=excluded.needs_review,
                    review_reason=excluded.review_reason,
                    status_updated_at=excluded.status_updated_at,
                    deleted=excluded.deleted,
                    deleted_at=excluded.deleted_at,
                    synced_at=excluded.synced_at
                WHERE local_dirty = 0
            """, (
                m['id'], m.get('name'), m.get('yardId'),
                m.get('code'), m.get('blocklyState'), m.get('status'),
                m.get('submittedAt'), m.get('startedAt'), m.get('completedAt'),
                m.get('youtubeUrl'), m.get('lockOwner'), m.get('lockedAt'),
                m.get('leaseExpiresAt'),
                m.get('needsReview', 0), m.get('reviewReason'),
                m.get('statusUpdatedAt'),
                1 if m.get('deleted') else 0, m.get('deletedAt'),
                synced_at,
            ))
        conn.execute("INSERT OR REPLACE INTO sync_meta VALUES ('last_synced_at', ?)", (synced_at,))
        conn.commit()
        conn.close()


def get_missions(limit=DEFAULT_FINISHED_PAGE, yard_id=None):
    """Missions for the operator console, read from the local mirror.

    `limit` caps only the FINISHED missions - it is the page size, not a
    ceiling. Everything still actionable (queued, processing, needs-review) is
    always returned in full.

    A flat "newest N" cap drops the oldest rows first, and the oldest rows are
    exactly the ones with work outstanding: a completed mission whose video was
    never attached, or a mission queued days ago and never run. Those would
    vanish from the console with no way to reach them.

    Returns (missions, last_synced_at, finished_total) so the caller can offer
    "show more" rather than silently truncating.

    `yard_id` scopes the list to this satellite's own yard (plan 3.3).
    """
    yard_clause = ' AND yard_id = ?' if yard_id else ''
    yard_params = [yard_id] if yard_id else []

    with _db_lock:
        conn = _connect()

        active = conn.execute(
            "SELECT * FROM mission_mirror"
            " WHERE deleted = 0 AND status IN ('queued','processing')" + yard_clause +
            " ORDER BY submitted_at DESC",
            yard_params,
        ).fetchall()

        # 'cancelled' stays hidden from the console entirely.
        finished = conn.execute(
            "SELECT * FROM mission_mirror"
            " WHERE deleted = 0 AND status IN ('completed','failed')" + yard_clause +
            " ORDER BY submitted_at DESC LIMIT ?",
            yard_params + [limit],
        ).fetchall()

        finished_total = conn.execute(
            "SELECT COUNT(*) AS n FROM mission_mirror"
            " WHERE deleted = 0 AND status IN ('completed','failed')" + yard_clause,
            yard_params,
        ).fetchone()['n']

        meta = conn.execute("SELECT value FROM sync_meta WHERE key = 'last_synced_at'").fetchone()
        conn.close()

    missions = [dict(r) for r in active] + [dict(r) for r in finished]
    missions.sort(key=lambda m: m.get('submitted_at') or '', reverse=True)

    last_synced = meta[0] if meta else None
    return missions, last_synced, finished_total


def get_mission(mission_id, include_deleted=False):
    """A single mission from the mirror, or None if it isn't there.

    Deleted missions are excluded by DEFAULT. Every action endpoint reaches a
    mission through here, so defaulting the other way meant a deleted mission
    stayed dispatchable to anyone who knew its id - it only disappeared from
    the lists. Callers that genuinely need to see a deleted row (the delete
    endpoint's double-delete guard) opt in explicitly.
    """
    sql = "SELECT * FROM mission_mirror WHERE id = ?"
    if not include_deleted:
        sql += " AND deleted = 0"
    with _db_lock:
        conn = _connect()
        row = conn.execute(sql, (mission_id,)).fetchone()
        conn.close()
    return dict(row) if row else None


def outbox_count():
    """Number of local writes not yet flushed to Firestore."""
    with _db_lock:
        conn = _connect()
        row = conn.execute("SELECT COUNT(*) AS n FROM outbox").fetchone()
        conn.close()
    return row['n']



# --- Write side: mirror + outbox (plan section 3.2 / PR 3) -----------------

def write_and_enqueue(mission_id, mirror_updates, op, payload):
    """Apply a local change to the mirror and queue it for Firestore, atomically.

    One SQLite transaction covers both, so the console can never show a state
    that has no matching outbox entry (which would silently never sync), nor
    queue a change it did not apply locally.

    `local_dirty` marks the row so the next Firestore pull cannot overwrite a
    change that has not been flushed yet - push-before-pull at the row level.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            updates = dict(mirror_updates)
            updates['local_dirty'] = 1
            sets = ', '.join(f'{k} = ?' for k in updates)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(updates.values()) + [mission_id],
            )
            now = _now_iso()
            conn.execute(
                'INSERT INTO outbox (uuid, mission_id, op, payload, event_at, created_at)'
                ' VALUES (?,?,?,?,?,?)',
                (str(uuid_mod.uuid4()), mission_id, op, json.dumps(payload), now, now),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def peek_outbox():
    """The oldest unflushed entry, or None.

    Ordering is by `seq`, never by a timestamp: the Pi has no real-time clock,
    so an offline boot can produce wildly wrong wall-clock values (plan 7.2).
    """
    with _db_lock:
        conn = _connect()
        row = conn.execute('SELECT * FROM outbox ORDER BY seq ASC LIMIT 1').fetchone()
        conn.close()
    return dict(row) if row else None


def delete_outbox(seq):
    """Drop an entry once Firestore has confirmed the write."""
    with _db_lock:
        conn = _connect()
        conn.execute('DELETE FROM outbox WHERE seq = ?', (seq,))
        conn.commit()
        conn.close()


def clear_dirty(mission_id):
    """Release a mirror row once nothing is queued for it, so Firestore pulls
    can refresh it again."""
    with _db_lock:
        conn = _connect()
        still_queued = conn.execute(
            'SELECT 1 FROM outbox WHERE mission_id = ? LIMIT 1', (mission_id,)
        ).fetchone()
        if not still_queued:
            conn.execute('UPDATE mission_mirror SET local_dirty = 0 WHERE id = ?', (mission_id,))
            conn.commit()
        conn.close()


def mark_attempt(seq, error_msg):
    """Record a failed flush so a stuck entry is visible rather than silent."""
    with _db_lock:
        conn = _connect()
        conn.execute(
            'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?',
            (error_msg, seq),
        )
        conn.commit()
        conn.close()


def log_conflict(mission_id, local_state, remote_state, resolution):
    """Record a merge where the losing side was already terminal (plan 6)."""
    with _db_lock:
        conn = _connect()
        conn.execute(
            'INSERT INTO conflict_log (mission_id, local_state, remote_state, resolution, logged_at)'
            ' VALUES (?,?,?,?,?)',
            (mission_id, local_state, remote_state, resolution, _now_iso()),
        )
        conn.commit()
        conn.close()


def get_conflicts(limit=50):
    with _db_lock:
        conn = _connect()
        rows = conn.execute(
            'SELECT * FROM conflict_log ORDER BY id DESC LIMIT ?', (limit,)
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


# --- Local mission locking (plan PR 1 semantics, PR 3 storage) -------------
#
# PR 1 acquired the lock with a Firestore transaction inside the request. PR 3
# takes Firestore out of the request path entirely so the console works with no
# internet, which means the lock has to move here. Losing the lock in the move
# would reintroduce the plan's defect A - two operators both read 'queued',
# both dispatch, and the rover runs the mission twice.
#
# So this keeps the same decision logic, made atomic by SQLite instead:
# BEGIN IMMEDIATE takes a write lock before the read, so a second caller waits
# rather than reading stale state. Contention is within one satellite, which is
# the only contention that exists (plan section 9: one yard, yardId-scoped).

def acquire_mission(mission_id, owner, now_iso, expires_iso, for_rerun=False):
    """Atomically claim a mission and queue the claim for Firestore.

    Returns (ok, reason, mission_dict). Reasons mirror the Firestore version:
    'not-found', 'not-queued' / 'not-terminal', 'locked-by-other'.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute(
                'SELECT * FROM mission_mirror WHERE id = ?', (mission_id,)
            ).fetchone()

            if row is None or row['deleted']:
                conn.rollback()
                return False, 'not-found', None

            mission = dict(row)
            status = mission.get('status')
            holder = mission.get('lock_owner')
            lease = mission.get('lease_expires_at')
            lease_live = bool(lease) and lease > now_iso

            if for_rerun:
                if status not in ('completed', 'failed'):
                    conn.rollback()
                    return False, 'not-terminal', None
            else:
                # An expired lease on a 'processing' mission means the holder
                # died; reclaiming it is the point of having a lease. No lease
                # at all is legacy data and is deliberately NOT reclaimable.
                reclaimable = status == 'processing' and bool(lease) and not lease_live
                if status != 'queued' and not reclaimable:
                    conn.rollback()
                    return False, 'not-queued', None

            if holder and holder != owner and lease_live:
                conn.rollback()
                return False, 'locked-by-other', None

            updates = {
                'status': 'processing',
                'started_at': now_iso,
                'status_updated_at': now_iso,
                'lock_owner': owner,
                'locked_at': now_iso,
                'lease_expires_at': expires_iso,
                'local_dirty': 1,
            }
            payload = {
                'status': 'processing',
                'startedAt': now_iso,
                'statusUpdatedAt': now_iso,
                'lockOwner': owner,
                'lockedAt': now_iso,
                'leaseExpiresAt': expires_iso,
            }
            if for_rerun:
                # A rerun supersedes the previous run's outcome.
                updates['completed_at'] = None
                updates['youtube_url'] = None
                payload['completedAt'] = None
                payload['youtubeUrl'] = None

            sets = ', '.join(f'{k} = ?' for k in updates)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(updates.values()) + [mission_id],
            )
            _enqueue(conn, mission_id, 'lock', payload)
            conn.commit()
            return True, None, mission
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def release_mission(mission_id, status, now_iso, review_reason=None):
    """Drop the lock and set a status, queueing both for Firestore.

    Used for terminal transitions and for rolling back when a dispatch never
    reached the rover.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            updates = {
                'status': status,
                'status_updated_at': now_iso,
                'lock_owner': None,
                'locked_at': None,
                'lease_expires_at': None,
                'local_dirty': 1,
            }
            payload = {
                'status': status,
                'statusUpdatedAt': now_iso,
                'lockOwner': None,
                'lockedAt': None,
                'leaseExpiresAt': None,
            }
            if status == 'completed':
                updates['completed_at'] = now_iso
                payload['completedAt'] = now_iso
            if review_reason is not None:
                updates['needs_review'] = 1
                updates['review_reason'] = review_reason
                payload['needsReview'] = True
                payload['reviewReason'] = review_reason

            sets = ', '.join(f'{k} = ?' for k in updates)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(updates.values()) + [mission_id],
            )
            _enqueue(conn, mission_id, 'release', payload)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def renew_lease(mission_id, expires_iso, now_iso):
    """Extend a live lease. Mirror-only: a renewal is not worth an outbox entry,
    because the lease is re-sent with the next real status change and a lapsed
    lease is recoverable by design."""
    with _db_lock:
        conn = _connect()
        conn.execute(
            'UPDATE mission_mirror SET lease_expires_at = ?, status_updated_at = ? WHERE id = ?',
            (expires_iso, now_iso, mission_id),
        )
        conn.commit()
        conn.close()


def set_mission_field(mission_id, mirror_updates, payload):
    """Generic mirror write + outbox enqueue for non-status changes (YouTube)."""
    write_and_enqueue(mission_id, mirror_updates, 'youtube', payload)


def _enqueue(conn, mission_id, op, payload):
    """Append to the outbox on an already-open transaction."""
    now = _now_iso()
    conn.execute(
        'INSERT INTO outbox (uuid, mission_id, op, payload, event_at, created_at)'
        ' VALUES (?,?,?,?,?,?)',
        (str(uuid_mod.uuid4()), mission_id, op, json.dumps(payload), now, now),
    )


def mission_has_pending(mission_id):
    """True if the outbox holds an unflushed entry for this mission."""
    with _db_lock:
        conn = _connect()
        row = conn.execute(
            'SELECT 1 FROM outbox WHERE mission_id = ? LIMIT 1', (mission_id,)
        ).fetchone()
        conn.close()
    return row is not None


def set_mirror_only(mission_id, updates):
    """Update the mirror WITHOUT queueing an outbox entry.

    For changes that were already written straight to Firestore (the YouTube
    poll), where enqueueing would push the same value back a second time.
    """
    with _db_lock:
        conn = _connect()
        sets = ', '.join(f'{k} = ?' for k in updates)
        conn.execute(
            f'UPDATE mission_mirror SET {sets} WHERE id = ?',
            list(updates.values()) + [mission_id],
        )
        conn.commit()
        conn.close()


# --- Recovery (plan PR 4) --------------------------------------------------

def find_interrupted(owner):
    """Missions this satellite still holds as 'processing' after a restart.

    These are genuinely ambiguous: the rover may have finished the run, or the
    power may have gone out mid-drive. Nothing here decides which - that is a
    human's call (plan 2.3, never move the robot without a human).
    """
    with _db_lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM mission_mirror WHERE status = 'processing' AND lock_owner = ?"
            " AND needs_review = 0",
            (owner,),
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def flag_for_review(mission_id, reason):
    """Mark a mission as needing a human decision, and queue that for Firestore.

    Deliberately does NOT change status: moving it to 'failed' would assert an
    outcome nobody established, and 'failed' reaches the learner as a run that
    went wrong. It stays 'processing' with the flag on top.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute(
                'UPDATE mission_mirror SET needs_review = 1, review_reason = ?, local_dirty = 1'
                ' WHERE id = ?',
                (reason, mission_id),
            )
            _enqueue(conn, mission_id, 'review', {'needsReview': True, 'reviewReason': reason})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def get_needs_review():
    with _db_lock:
        conn = _connect()
        rows = conn.execute(
            'SELECT * FROM mission_mirror WHERE needs_review = 1 ORDER BY submitted_at DESC'
        ).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def resolve_review(mission_id, status, now_iso):
    """Clear the review flag and set the status a human chose.

    'completed' means the operator confirmed the run finished; 'queued' puts it
    back in the queue to be run again. Either way the lock is released.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            updates = {
                'status': status,
                'status_updated_at': now_iso,
                'needs_review': 0,
                'review_reason': None,
                'lock_owner': None,
                'locked_at': None,
                'lease_expires_at': None,
                'local_dirty': 1,
            }
            payload = {
                'status': status,
                'statusUpdatedAt': now_iso,
                'needsReview': False,
                'reviewReason': None,
                'lockOwner': None,
                'lockedAt': None,
                'leaseExpiresAt': None,
            }
            if status == 'completed':
                updates['completed_at'] = now_iso
                payload['completedAt'] = now_iso
            else:
                # Re-queued: clear the previous run's stamps so it looks fresh.
                updates['started_at'] = None
                payload['startedAt'] = None

            sets = ', '.join(f'{k} = ?' for k in updates)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(updates.values()) + [mission_id],
            )
            _enqueue(conn, mission_id, 'resolve', payload)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


# --- Sync cursors (read-cost control) --------------------------------------

def get_meta(key, default=None):
    with _db_lock:
        conn = _connect()
        row = conn.execute('SELECT value FROM sync_meta WHERE key = ?', (key,)).fetchone()
        conn.close()
    return row['value'] if row else default


def set_meta(key, value):
    with _db_lock:
        conn = _connect()
        conn.execute('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?,?)', (key, value))
        conn.commit()
        conn.close()


def newest_submitted_at():
    """Highest submittedAt in the mirror - the incremental pull cursor."""
    with _db_lock:
        conn = _connect()
        row = conn.execute('SELECT MAX(submitted_at) AS m FROM mission_mirror').fetchone()
        conn.close()
    return row['m'] if row and row['m'] else None


def active_mission_ids(yard_id=None):
    """Ids the mirror still considers non-terminal.

    Reconciliation reads these specific documents. Querying Firestore for
    remotely-active missions instead would miss the transition that matters
    most - a mission that finished elsewhere no longer matches an "active"
    filter, so the mirror would never learn it was done.
    """
    with _db_lock:
        conn = _connect()
        sql = ("SELECT id FROM mission_mirror"
               " WHERE deleted = 0 AND status IN ('queued','processing')")
        params = []
        if yard_id:
            sql += ' AND yard_id = ?'
            params.append(yard_id)
        rows = conn.execute(sql, params).fetchall()
        conn.close()
    return [r['id'] for r in rows]


def forget_mission(mission_id):
    """Drop a mirror row for a mission that no longer exists in Firestore.

    Only ever called for a row with nothing queued for it - see the guard in
    the sync worker. Removing a row with pending writes would silently discard
    a local change that was never pushed.
    """
    with _db_lock:
        conn = _connect()
        pending = conn.execute(
            'SELECT 1 FROM outbox WHERE mission_id = ? LIMIT 1', (mission_id,)
        ).fetchone()
        if pending:
            conn.close()
            return False
        conn.execute('DELETE FROM mission_mirror WHERE id = ?', (mission_id,))
        conn.commit()
        conn.close()
        return True


def delete_mission(mission_id, now_iso):
    """Soft-delete: flag the mission and queue that for Firestore.

    Soft rather than hard on purpose. The operator is told this is permanent -
    and to them it is, there is no undo in the console - but the document
    survives, so a mis-tap on a child's completed mission with a video attached
    is recoverable by someone with database access. A hard delete would make
    a single wrong tap unrecoverable, which is a bad trade for a field that
    costs one integer.

    Also releases the lock: a deleted mission must never keep a lease alive.
    """
    with _db_lock:
        conn = _connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            updates = {
                'deleted': 1,
                'deleted_at': now_iso,
                'status_updated_at': now_iso,
                'lock_owner': None,
                'locked_at': None,
                'lease_expires_at': None,
                'local_dirty': 1,
            }
            payload = {
                'deleted': True,
                'deletedAt': now_iso,
                'statusUpdatedAt': now_iso,
                'lockOwner': None,
                'lockedAt': None,
                'leaseExpiresAt': None,
            }
            sets = ', '.join(f'{k} = ?' for k in updates)
            conn.execute(
                f'UPDATE mission_mirror SET {sets} WHERE id = ?',
                list(updates.values()) + [mission_id],
            )
            _enqueue(conn, mission_id, 'delete', payload)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
