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


def get_missions(limit=100, yard_id=None):
    """Read missions from the local mirror.

    `yard_id` scopes the list to this satellite's own yard (plan 3.3). It is
    applied here rather than in the Firestore pull because a
    `yardId + submittedAt` query needs a composite index that does not exist,
    and with one yard the difference is only how much gets mirrored. If a
    second yard is ever added, move this into the sync query and add the index.
    """
    with _db_lock:
        conn = _connect()
        if yard_id:
            rows = conn.execute(
                "SELECT * FROM mission_mirror WHERE status != 'cancelled' AND yard_id = ?"
                " ORDER BY submitted_at DESC LIMIT ?",
                (yard_id, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM mission_mirror WHERE status != 'cancelled'"
                " ORDER BY submitted_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
        meta = conn.execute("SELECT value FROM sync_meta WHERE key = 'last_synced_at'").fetchone()
        conn.close()

    last_synced = meta[0] if meta else None
    missions = [dict(row) for row in rows]
    return missions, last_synced


def get_mission(mission_id):
    """A single mission from the mirror, or None if it isn't there."""
    with _db_lock:
        conn = _connect()
        row = conn.execute(
            "SELECT * FROM mission_mirror WHERE id = ?", (mission_id,)
        ).fetchone()
        conn.close()
    return dict(row) if row else None


def outbox_count():
    """Number of local writes not yet flushed to Firestore."""
    with _db_lock:
        conn = _connect()
        row = conn.execute("SELECT COUNT(*) AS n FROM outbox").fetchone()
        conn.close()
    return row['n']

