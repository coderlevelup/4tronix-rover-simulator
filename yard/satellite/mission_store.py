import sqlite3
import threading
import os
import json
import uuid as uuid_mod

from datetime import datetime, timezone

def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


DB_PATH = os.environ.get('MISSION_MIRROR_DB', 'missions.db')
_db_lock = threading.Lock()


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
                lease_expires_at  TEXT,
                needs_review      INTEGER DEFAULT 0,
                review_reason     TEXT,
                status_updated_at TEXT,
                synced_at         TEXT,
                local_dirty       INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS sync_meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

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
        """)
        conn.commit()
        conn.close()


def upsert_missions(missions, synced_at):
    """Write a batch of missions from Firestore into the mirror."""
    with _db_lock:
        conn = _connect()
        for m in missions:
            conn.execute("""
                INSERT INTO mission_mirror
                    (id, name, yard_id, code, blockly_state, status,
                     submitted_at, started_at, completed_at, youtube_url,
                     lock_owner, lease_expires_at, needs_review, review_reason,
                     status_updated_at, synced_at, local_dirty)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
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
                    lease_expires_at=excluded.lease_expires_at,
                    needs_review=excluded.needs_review,
                    review_reason=excluded.review_reason,
                    status_updated_at=excluded.status_updated_at,
                    synced_at=excluded.synced_at
                WHERE local_dirty = 0
            """, (
                m['id'], m.get('name'), m.get('yardId'),
                m.get('code'), m.get('blocklyState'), m.get('status'),
                m.get('submittedAt'), m.get('startedAt'), m.get('completedAt'),
                m.get('youtubeUrl'), m.get('lockOwner'), m.get('leaseExpiresAt'),
                m.get('needsReview', 0), m.get('reviewReason'),
                m.get('statusUpdatedAt'), synced_at,
            ))
        conn.execute("INSERT OR REPLACE INTO sync_meta VALUES ('last_synced_at', ?)", (synced_at,))
        conn.commit()
        conn.close()


def get_missions(limit=100):
    """Read missions from the local mirror."""
    with _db_lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM mission_mirror WHERE status != 'cancelled' ORDER BY submitted_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        meta = conn.execute("SELECT value FROM sync_meta WHERE key = 'last_synced_at'").fetchone()
        conn.close()

    last_synced = meta[0] if meta else None
    missions = [dict(row) for row in rows]
    return missions, last_synced

def get_mission(mission_id):
    """Read a single mission from the mirror."""
    with _db_lock:
        conn = _connect()
        row = conn.execute('SELECT * FROM mission_mirror WHERE id = ?', (mission_id,)).fetchone()
        conn.close()
    return dict(row) if row else None


def write_and_enqueue(mission_id, mirror_updates, op, payload):
    """Update the mirror and append to outbox in one transaction."""
    with _db_lock:
        conn = _connect()
        # Build SET clause from mirror_updates dict
        sets = ', '.join(f'{k} = ?' for k in mirror_updates)
        vals = list(mirror_updates.values())
        conn.execute(
            f'UPDATE mission_mirror SET {sets} WHERE id = ?',
            vals + [mission_id]
        )
        now = _now_iso()
        conn.execute(
            '''INSERT INTO outbox (uuid, mission_id, op, payload, event_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (str(uuid_mod.uuid4()), mission_id, op, json.dumps(payload), now, now)
        )
        conn.commit()
        conn.close()


def peek_outbox():
    """Return the oldest outbox entry (lowest seq), or None if empty."""
    with _db_lock:
        conn = _connect()
        row = conn.execute(
            'SELECT * FROM outbox ORDER BY seq ASC LIMIT 1'
        ).fetchone()
        conn.close()
    return dict(row) if row else None


def delete_outbox(seq):
    """Remove an outbox entry after Firestore has confirmed the write."""
    with _db_lock:
        conn = _connect()
        conn.execute('DELETE FROM outbox WHERE seq = ?', (seq,))
        conn.commit()
        conn.close()


def mark_attempt(seq, error_msg):
    """Record a failed flush attempt so we can see what went wrong."""
    with _db_lock:
        conn = _connect()
        conn.execute(
            'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?',
            (error_msg, seq)
        )
        conn.commit()
        conn.close()


def outbox_count():
    """How many entries are waiting to be pushed to Firestore."""
    with _db_lock:
        conn = _connect()
        row = conn.execute('SELECT COUNT(*) FROM outbox').fetchone()
        conn.close()
    return row[0]


