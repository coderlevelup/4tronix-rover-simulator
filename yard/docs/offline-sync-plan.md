# Offline Sync and Mission Locking Plan

This document specifies how the yard satellite should lock missions while they run,
survive running missions with no internet, and reconcile with Firestore when the
network comes back.

Owner: Kamogelo Tsele. Raised by Werner Van Rensburg in the 2026-07-23 standup, where
he flagged that cached missions plus multiple sites means real distributed-systems
complexity: "is it going to be executed, is it not going to be executed, you need to
sync that back, and now you've got locks on certain of those missions."

> **Why this matters now.** On Mandela Day (2026-07-18) the science centre wifi was bad
> enough that operator sign-in had to be disabled with `OPERATOR_AUTH=off` to get 45
> missions through. That escape hatch only skips *login*. Every mission action still
> requires live Firestore access, so a worse network would have stopped the event
> entirely. This plan removes that dependency.

---

## 1. Current behaviour

All four mutating operator actions in
[`yard/satellite/operator_console.py`](../satellite/operator_console.py) follow the same
sequence:

1. **Pull.** `_get_mission_ref()` ([line 284](../satellite/operator_console.py#L284)) does a
   synchronous `ref.get()` against Firestore and returns the current document.
2. **Guard.** Check the status is legal for this action (`send` requires `queued`,
   `youtube` requires `completed`, and so on).
3. **Dispatch.** `_dispatch_to_rover()` ([line 292](../satellite/operator_console.py#L292))
   POSTs to the rover's local `/queue/add`.
4. **Push.** `ref.update({...})` writes the new status back to Firestore.

### Three defects this creates

**A. The read-then-write is not atomic.** `api_send_to_rover`
([line 319](../satellite/operator_console.py#L319)) reads the status, then writes it in a
separate call. Two operators tapping "Send" at the same moment both read `queued`, both
dispatch, and the rover runs the mission twice. This is not theoretical on a single
satellite: `web_server.py` runs `app.run(threaded=True)`, so requests genuinely interleave.

**B. `processing` is not a lock.** It records that *something* started but not *who*
started it or *when it expires*. If the satellite loses power mid-mission, that mission
sits in `processing` forever with nothing able to release it.

**C. The Firestore calls in mutations have no error handling at all.** `api_missions`
([line 263](../satellite/operator_console.py#L263)) wraps its query in `try/except` and
returns a clean 502, but `_get_mission_ref` does not. With no internet, step 1 raises,
Flask returns an unhandled 500, and the rover is never reached. There is no successful
"ran offline" path today; the request fails at the door.

There is also a partial-failure window worth naming: if Firestore is reachable at step 1
but drops before step 4, the rover has **already physically run the mission** and Firestore
never finds out. The mission shows `queued` forever while the rover considers it done.

---

## 2. Principles

These four rules drive every design decision below. When something in this document is
ambiguous, resolve it by returning to these.

### 2.1 Push before pull

On reconnect, **flush the outbound queue first, then fetch from Firestore.** Never the
reverse.

A local write records a physical event: the rover actually moved across the yard. The
Firestore copy is stale by definition, because it never heard about that run. Pulling
first would overwrite ground truth with staleness and silently erase the fact that a
mission ran.

### 2.2 Status is monotonic

Define a rank over statuses. A mission only ever moves *up* it, never down.

```python
_RANK = {'queued': 0, 'processing': 1, 'cancelled': 2, 'failed': 3, 'completed': 4}
```

Merging local and remote becomes: higher rank wins, ties broken by later event time. This
makes most reconnect conflicts resolve themselves with no coordination, because both sides
converge on the highest state either one reached. A terminal state can never degrade back
to `queued`.

### 2.3 Never move the robot without a human

No recovery path, lease expiry, or retry may automatically re-dispatch a mission to the
rover. Physical actions are not replayable. Anything ambiguous gets surfaced to an
operator who decides.

### 2.4 One write queue, and it lives on the satellite

The browser keeps `YardCache` (merged in PR #35) as a **read-side display cache only**. Do
not add a second write queue in the browser: two queues can disagree, and a phone can
close its tab and lose pending writes. The satellite is always on, owns the rover, and can
persist to disk.

---

## 3. Data model

### 3.1 New Firestore fields on `missions`

| Field | Type | Purpose |
|---|---|---|
| `lockOwner` | string \| null | Satellite ID currently holding the mission. |
| `lockedAt` | ISO8601 \| null | When the lease was acquired. |
| `leaseExpiresAt` | ISO8601 \| null | When the lease becomes reclaimable. |
| `needsReview` | bool | Set when recovery cannot determine the outcome. |
| `reviewReason` | string \| null | e.g. `interrupted`, `sync-conflict`. |
| `statusUpdatedAt` | ISO8601 | When status last changed, for tie-breaking. |

Existing statuses are unchanged and already defined in
[`Mission.ts`](../../mission-control/src/core/domain/entities/Mission.ts#L13):
`queued`, `processing`, `completed`, `failed`, `cancelled`.

> **Learner-facing note.** `discoveryStatus.ts` already collapses
> `queued`/`processing`/`failed`/`cancelled` into "Pending" for learners. Do not surface
> `failed` or `needsReview` on any learner page. Operators see the real state; learners
> see Completed or Pending only.

### 3.2 Satellite-local store (SQLite)

Use stdlib `sqlite3`. No new dependency, real transactions, and safe under `threaded=True`
if opened with `check_same_thread=False` behind a lock.

```sql
-- Read cache: what we last knew about missions, so the console works offline.
CREATE TABLE mission_mirror (
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
  synced_at         TEXT,   -- last time this row came from Firestore
  local_dirty       INTEGER DEFAULT 0
);

-- Write queue: local changes not yet accepted by Firestore.
CREATE TABLE outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,  -- authoritative ordering
  uuid       TEXT UNIQUE NOT NULL,               -- idempotency key
  mission_id TEXT NOT NULL,
  op         TEXT NOT NULL,   -- lock | complete | fail | youtube | requeue | release
  payload    TEXT NOT NULL,   -- JSON
  event_at   TEXT NOT NULL,   -- local wall clock, ADVISORY ONLY (see 7.2)
  attempts   INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE conflict_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id  TEXT NOT NULL,
  local_state TEXT NOT NULL,
  remote_state TEXT NOT NULL,
  resolution  TEXT NOT NULL,
  logged_at   TEXT NOT NULL
);
```

### 3.3 Satellite identity

The satellite currently has no identity. `satellite_config.json` holds only `rover_url`,
and `api_missions` returns every mission regardless of yard.

Add two values, read at startup and persisted into `satellite_config.json` if absent:

- `satellite_id`: generate a UUID once on first boot. Used as `lockOwner`.
- `yard_id`: must match the `yardId` on missions (e.g. `uct-rover-1`). Configured, not generated.

Filter the mission list by `yard_id`. Missions already carry `yardId`, so locks are only
ever contended *within* a yard. Cross-yard contention is close to theoretical until the
Durban or UKZN yards exist.

---

## 4. Architecture

```
              Firestore  (source of truth when reachable)
                   ^  |
     flush outbox  |  |  pull mirror
        (FIRST)    |  v   (SECOND)
            +------------------+
            |  sync worker     |   background thread on the satellite
            +------------------+
                   |
            +------------------+
            | SQLite           |   mission_mirror + outbox (durable on disk)
            +------------------+
                   |
            +------------------+
            | Flask operator   |   reads/writes SQLite, never Firestore directly
            |    console       |
            +------------------+
              |            |
     browser (YardCache)   |  local HTTP
     read cache only       v
                     Rover queue :8523
```

The key inversion: **the Flask request handlers stop talking to Firestore.** They read and
write SQLite only. The sync worker is the sole component that touches Firestore. This is
what makes offline operation work without special-casing every endpoint.

---

## 5. Implementation, as four PRs

Land these in order. Each is independently shippable with its own tests. Do not combine
them: distributed-systems logic in one giant diff is not reviewable.

Branch naming per CONTRIBUTING: `feat/AB#<n>-slug`, with `Fixes AB#<n>` in both the commit
message and PR title. Get the card number from the board, do not infer it.

### PR 1: Transactional locking

**Goal:** make acquiring a mission atomic and give locks an owner and an expiry.

- Add the lock fields from 3.1 to the Firestore write path.
- Replace the read-then-write in `api_send_to_rover` and `api_rerun` with a Firestore
  transaction:

```python
from firebase_admin import firestore

@firestore.transactional
def _acquire(transaction, ref, owner, now_iso, expires_iso):
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return False, 'not-found'
    data = snap.to_dict() or {}

    if data.get('status') != 'queued':
        return False, 'not-queued'

    holder = data.get('lockOwner')
    lease = data.get('leaseExpiresAt')
    if holder and holder != owner and lease and lease > now_iso:
        return False, 'locked-by-other'

    transaction.update(ref, {
        'status': 'processing',
        'startedAt': now_iso,
        'statusUpdatedAt': now_iso,
        'lockOwner': owner,
        'lockedAt': now_iso,
        'leaseExpiresAt': expires_iso,
    })
    return True, None
```

- Acquire the lock **before** dispatching to the rover. If the lock fails, do not dispatch.
- Release the lock (`lockOwner`, `lockedAt`, `leaseExpiresAt` to `null`) whenever the
  mission reaches a terminal state.
- Lease TTL: **5 minutes**, renewed every 60 seconds while a mission is `processing`.
  Missions run for seconds, but David's transcript describes operators resetting the rover
  and swapping batteries between attempts, so the wall-clock window is minutes.
- Add a local `threading.Lock` around acquire as well. The Firestore transaction handles
  cross-process races; the local lock avoids two threads on the same satellite both
  dispatching to the rover before either transaction commits.
- **Also pass `mission_id` in the rover dispatch payload.** `_dispatch_to_rover` currently
  sends only `code` and `blockly_state`. Adding the ID lets the rover's history be
  cross-referenced during recovery (see PR 4) and is nearly free.

**Acceptance:** two simultaneous `send` requests for one mission result in exactly one rover
dispatch. An expired lease can be reclaimed. A live lease held by another satellite is
rejected with a clear message.

### PR 2: Satellite mission mirror (offline read)

**Goal:** the console loads and lists missions with no internet.

- Create the SQLite store and schema from 3.2.
- Add the sync worker as a background thread. Follow the pattern already established by
  `start_polling` ([line 490](../satellite/operator_console.py#L490)): wrap the body so a
  failure can never kill the loop, and launch it as a `daemon=True` thread from
  `web_server.py` so a slow call cannot delay satellite startup.
- On each successful pull, upsert into `mission_mirror` and stamp `synced_at`.
- Rewrite `api_missions` to read from the mirror, never from Firestore, and return:

```json
{
  "missions": [...],
  "stale": true,
  "lastSyncedAt": "2026-07-25T09:14:02Z",
  "pendingWrites": 3
}
```

  Adding fields is backward compatible: the JS merged in PR #35 reads `data.missions || []`
  and ignores the rest.

**Acceptance:** with the network cable pulled, the operator console still lists the last
known missions and shows how stale they are.

**UI follow-on (coordinate with Yamkela):** `YardCache` currently guesses staleness from
its own cache timestamp. Once the API reports `lastSyncedAt` and `pendingWrites`
authoritatively, the banner should use those instead, and show a pending count so an
operator can see "3 changes waiting to sync" rather than wondering. This lands on David's
"don't make me think" point directly.

### PR 3: Outbox and push-before-pull sync

**Goal:** run missions offline and reconcile correctly on reconnect.

- Every mutating endpoint writes to `mission_mirror` and appends to `outbox` in a single
  SQLite transaction, then dispatches to the rover. Firestore is not touched in the
  request path at all.
- Sync worker cycle, in this exact order:
  1. If the outbox is non-empty, flush it in ascending `seq` order. Stop on the first
     failure and retry the same entry next cycle. Do not skip ahead: ordering matters.
  2. Only once the outbox is empty, pull the mission list and update the mirror.
- Each flush applies the merge rule from section 6 inside a Firestore transaction, so a
  concurrent remote change cannot be clobbered.
- Idempotency: the `uuid` on each outbox row is the key. A flush that succeeds but whose
  acknowledgement is lost must not double-apply on retry. Since every operation is a state
  assignment rather than an increment, re-applying is naturally safe, but the merge rule
  must still be evaluated on retry rather than blindly overwriting.
- Delete outbox rows only after Firestore confirms the write.

**Acceptance:** disconnect the satellite, run a mission end to end, mark it complete,
reconnect, and Firestore ends up `completed`. Assert explicitly that no pull happens
before the outbox drains.

### PR 4: Recovery and conflict surfacing

**Goal:** nothing is silently lost, and nothing moves the robot by itself.

- On satellite startup, find mirror rows with `status = 'processing'` and
  `lock_owner = <me>`. These are ambiguous: the rover may or may not have finished.
- Optionally disambiguate first by querying the rover's `/queue/status` history for the
  `mission_id` added in PR 1. If the rover confirms it completed, resolve automatically.
- If still ambiguous, set `needs_review = 1`, `review_reason = 'interrupted'`. **Do not
  re-dispatch and do not auto-mark failed.**
- Surface these in the operator console as a distinct "Needs review" group with two
  explicit actions:
  - **It finished** sets `completed`.
  - **Re-queue it** returns the mission to `queued` and releases the lock.
- Render `conflict_log` entries somewhere the team can see them. A simple read-only list
  on the `/status` page is enough.

**Acceptance:** kill the satellite process mid-mission, restart, and the mission appears
under "Needs review" with no rover movement having occurred.

---

## 6. Conflict resolution

Applied inside the flush transaction, comparing the outbox entry (local) against the
current Firestore document (remote).

**Rule:** higher `_RANK` wins. On a tie, the later `statusUpdatedAt` wins.

| Local | Remote | Winner | Why |
|---|---|---|---|
| `completed` | `queued` | local | The rover physically ran it. Normal offline case. |
| `completed` | `processing` | local | We are the ones who ran it. |
| `completed` | `cancelled` | **local**, logged | The run happened and a video may exist. Team decision, 2026-07-25. |
| `completed` | `failed` | local | A successful rerun supersedes an earlier failure. |
| `failed` | `cancelled` | local | An attempted run is more informative than a cancellation. |
| `processing` | `completed` | remote | Someone already finished it. Do not downgrade. |
| `queued` | anything higher | remote | Never resurrect a mission backwards. |
| same rank | later `statusUpdatedAt` | later | Tie-break. |

Write a `conflict_log` row whenever the losing side was already terminal. Normal forward
progression (`queued` losing to `completed`) is not a conflict and should not be logged, or
the log becomes noise nobody reads.

---

## 7. Gotchas

### 7.1 SQLite under a threaded Flask server

`app.run(threaded=True)` means concurrent handlers. Open connections with
`check_same_thread=False` and guard writes with a `threading.Lock`, or use one connection
per thread. Use `BEGIN IMMEDIATE` when claiming outbox rows so two threads cannot pop the
same entry.

### 7.2 The Raspberry Pi has no real-time clock

This one will bite you. A Pi with no network at boot can come up with a badly wrong system
time, so `event_at` timestamps from an offline session are not trustworthy.

**Ordering must come from the `seq` column, which is monotonic and local.** Treat wall-clock
timestamps as advisory metadata for humans and for tie-breaking only, never as the primary
ordering mechanism. If you find yourself sorting the outbox by `event_at`, that is a bug.

### 7.3 Do not regress the offline paths that already work

The tablet's `/code/` Blockly interface and the `/monitor/` TV display talk straight to the
rover over the satellite's own hotspot and never touch Firestore. They already work with
zero internet. Nothing in this plan should add a Firestore dependency to either.

### 7.4 `OPERATOR_AUTH=off` still needs to work

The event-day escape hatch bypasses login only. Make sure the new code paths respect
`current_operator()` returning the offline stub, and that `lockOwner` records something
sensible (the satellite ID, not the stub user) in that mode.

### 7.5 The YouTube poll writes to Firestore too

`check_for_new_videos` ([line 419](../satellite/operator_console.py#L419)) sets `youtubeUrl`
directly. It only runs when online since it needs the YouTube API, so routing it through
the outbox is optional. If you leave it direct, make sure its write cannot clobber a
pending outbox entry for the same mission.

---

## 8. Testing

`yard/satellite/tests/test_operator_console.py` already fakes Firestore with
`FakeFirestore`, `FakeQueryCollection`, and friends, and the suite currently passes 146
tests. Extend the fakes rather than introducing a new mocking approach.

You will need a `FakeTransaction` supporting `get(ref, transaction=...)` and
`update(ref, fields)`, plus a way to simulate a concurrent write landing between the two.

Required cases:

- **Concurrency:** two simultaneous acquires, exactly one wins, exactly one rover dispatch.
- **Lease:** expired lease is reclaimable; live lease held by another owner is rejected.
- **Offline dispatch:** Firestore raising does not prevent the rover dispatch, and an
  outbox row is written.
- **Flush ordering:** entries apply in `seq` order; a failure mid-flush stops the run and
  retries the same entry, without skipping ahead.
- **Push before pull:** assert no pull occurs while the outbox is non-empty. This is the
  single most important behavioural test in the story.
- **Merge rules:** table-driven over every `(local, remote)` pair in section 6.
- **Idempotency:** replaying an already-applied `uuid` produces one net effect.
- **Recovery:** an interrupted `processing` mission becomes `needs_review` on restart, with
  zero rover calls.

Run with the project venv:

```bash
.venv/bin/python -m pytest yard/satellite/tests yard/rover -q \
  --ignore=yard/satellite/tests/test_blockly_codegen.py \
  --ignore=yard/satellite/tests/test_status_page.py
```

The two ignored files need `playwright`, which is not installed in this environment. That
is a pre-existing gap, unrelated to this work.

---

## 9. Out of scope

- **Moving the operator console into mission-control.** Deferred to iteration 3 by team
  decision. This plan deliberately keeps dispatch on the satellite. If that move happens
  later, the outbox and lock design survives it: mission-control would write the intent and
  the satellite's sync worker would still be the only thing that talks to the rover.
- **Cross-satellite lock negotiation.** The lease fields are designed in, but with one yard
  and `yardId` scoping, contention between satellites cannot occur yet. Do not build
  handoff protocols for a second yard that does not exist.
- **Automated YouTube upload.** `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` exist in
  `.env.example` for this, but no code consumes them yet.
- **Learner-facing changes.** Everything here is operator-side. Learners keep seeing
  Completed or Pending only.
