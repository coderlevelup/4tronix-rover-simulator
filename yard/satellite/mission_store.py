import sqlite3
import threading
import os

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

