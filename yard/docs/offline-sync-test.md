# Testing Task List for Offline Sync PRs 1–3

The code lives on three branches: `feat/MissionLock` (PR 1),
`feat/SatelliteMissionMirror` (PR 2), and `feat/OfflineFirstSync` (PR 3,
which includes PR 2's code). Below are the tests needed, grouped by the
scenario they validate.

---

## A. PR 1 — Transactional Locking (`feat/MissionLock`)

### A1. Concurrency: two simultaneous acquires

| # | Test | What to assert |
|---|------|----------------|
| 1 | Two threads call `api_send_to_rover` for the same queued mission concurrently | Exactly one gets `200 ok`; the other gets `400` or `409` |
| 2 | Only one `POST /queue/add` is made to the rover (count dispatches) | `_dispatch_to_rover` called exactly once |
| 3 | After both return, Firestore has `lockOwner` set to the winner's UID | Assert the mission doc's `lockOwner` field |

### A2. Lease expiry and reclaim

| # | Test | What to assert |
|---|------|----------------|
| 4 | A mission has a `leaseExpiresAt` in the past + `lockOwner = 'other-satellite'` → a new acquire succeeds | Returns `(True, None)` |
| 5 | A mission has a **live** lease (future `leaseExpiresAt`) + different `lockOwner` → acquire is rejected | Returns `(False, 'locked-by-other')` |
| 6 | Same owner re-acquires their own live lease (idempotent) | Returns `(True, None)` — not rejected |

### A3. Lease lifecycle

| # | Test | What to assert |
|---|------|----------------|
| 7 | After successful send, `_start_lease_renewal` is called with the right `mission_id` | Timer scheduled |
| 8 | After `api_mark_complete`, `_stop_lease_renewal` cancels the timer | `Timer.cancel()` called; `_active_leases` dict no longer has the key |
| 9 | Lease renewal updates `leaseExpiresAt` to a future time on each tick | Fake a timer fire and check the written field |

### A4. Lock release on dispatch failure

| # | Test | What to assert |
|---|------|----------------|
| 10 | `api_send_to_rover` acquires, but rover returns HTTP 500 → lock is released | `lockOwner` reset to `None`, status back to `queued` |
| 11 | `api_rerun` acquires, but rover is unreachable → lock is released | `lockOwner` reset to `None`, status back to `failed` (prev terminal) |

### A5. `mission_id` in rover payload

| # | Test | What to assert |
|---|------|----------------|
| 12 | The `POST /queue/add` body includes `params.mission_id` equal to the actual ID | Inspect the JSON body sent to the rover fake |

### A6. `_acquire` edge cases

| # | Test | What to assert |
|---|------|----------------|
| 13 | Mission does not exist | Returns `(False, 'not-found')` |
| 14 | Mission is `processing` (not `queued`) | Returns `(False, 'not-queued')` |
| 15 | Mission has `lockOwner` but **no** `leaseExpiresAt` field → treat as unlocked | Acquire succeeds (defensive) |

---

## B. PR 2 — SQLite Mission Mirror (`feat/SatelliteMissionMirror`)

### B1. Schema and init

| # | Test | What to assert |
|---|------|----------------|
| 16 | `init_db()` creates `mission_mirror`, `outbox`, `sync_meta` tables | Query `sqlite_master` after init |
| 17 | Calling `init_db()` twice is idempotent (no crash) | No exception on second call |

### B2. `upsert_missions`

| # | Test | What to assert |
|---|------|----------------|
| 18 | Insert three new missions → all three appear in `get_missions()` | Correct count + field mapping |
| 19 | Upsert with changed `status` for an existing ID → row is updated | `get_mission(id)` returns new status |
| 20 | Upsert does **not** overwrite a `local_dirty = 1` row | Dirty row retains its local values |
| 21 | `synced_at` is stored in `sync_meta` after upsert | `get_missions()` returns correct `last_synced` |
| 22 | Field mapping: Firestore `camelCase` keys → SQLite `snake_case` columns | e.g., `yardId` → `yard_id`, `blocklyState` → `blockly_state` |

### B3. `get_missions` / `get_mission`

| # | Test | What to assert |
|---|------|----------------|
| 23 | Returns missions ordered by `submitted_at DESC` | First result is most recent |
| 24 | Excludes cancelled missions | `status = 'cancelled'` not in results |
| 25 | Respects the `limit` parameter | Insert 150 rows, `get_missions(limit=50)` returns 50 |
| 26 | `get_mission('nonexistent')` returns `None` | |

### B4. `api_missions` endpoint (reads from mirror)

| # | Test | What to assert |
|---|------|----------------|
| 27 | Response contains `missions`, `stale`, `lastSyncedAt`, `pendingWrites` keys | JSON schema check |
| 28 | `stale = True` if `last_synced_at` is >60s ago or `None` | |
| 29 | `stale = False` if `last_synced_at` is <60s ago | |
| 30 | `pendingWrites` reflects actual outbox count | Insert 3 outbox rows, check value = 3 |

### B5. Sync worker pull

| # | Test | What to assert |
|---|------|----------------|
| 31 | `sync_from_firestore` reads from Firestore and calls `upsert_missions` | Mirror populated after one call |
| 32 | Firestore raising an exception does not crash the worker loop | Worker continues; mirror unchanged |
| 33 | `start_sync_worker` re-schedules itself after each run | Timer is set for next interval |

---

## C. PR 3 — Outbox & Push-Before-Pull (`feat/OfflineFirstSync`)

### C1. `write_and_enqueue` atomicity

| # | Test | What to assert |
|---|------|----------------|
| 34 | After `write_and_enqueue`, both the mirror row AND outbox row are present | Query both tables |
| 35 | The outbox row has a valid UUID, correct `mission_id`, `op`, and `payload` | Field-by-field check |
| 36 | Mirror row has `local_dirty = 1` after a local write | Prevents remote upsert from clobbering |
| 37 | Multiple enqueues get ascending `seq` values | `seq` of second > first |

### C2. Offline dispatch (Firestore never touched)

| # | Test | What to assert |
|---|------|----------------|
| 38 | `api_send_to_rover` with Firestore unreachable → still returns 200, rover gets dispatched | No Firestore call in request path |
| 39 | An outbox row is written even when network is down | `outbox_count() > 0` after the call |
| 40 | The rover receives the `POST /queue/add` regardless of Firestore state | Rover fake called |

### C3. Flush ordering

| # | Test | What to assert |
|---|------|----------------|
| 41 | Outbox entries are flushed in ascending `seq` order | Mock Firestore; assert call order matches seq order |
| 42 | If entry #2 fails (Firestore throws), entry #3 is NOT attempted | Only one `flush_one` failure, no calls for seq > #2 |
| 43 | On next cycle, the **same failed entry** (#2) is retried first | `peek_outbox()` still returns seq #2 |
| 44 | `attempts` is incremented and `last_error` is set on failure | Check outbox row fields |
| 45 | On success, the entry is deleted from the outbox | `peek_outbox()` returns the next seq or `None` |

### C4. Push before pull (the most critical test)

| # | Test | What to assert |
|---|------|----------------|
| 46 | While outbox is non-empty, `sync_cycle` does NOT call `sync_from_firestore` | Spy/mock on pull function; assert zero calls |
| 47 | After outbox drains completely, `sync_cycle` calls `sync_from_firestore` exactly once | Pull is invoked |
| 48 | Enqueue during a flush cycle → pull still blocked until new entry also flushes | Re-check after adding mid-cycle |

### C5. Merge rules (table-driven)

| # | Test | What to assert |
|---|------|----------------|
| 49 | `completed` local vs `queued` remote | `should_local_win` returns `True` |
| 50 | `completed` local vs `processing` remote | `should_local_win` returns `True` |
| 51 | `completed` local vs `cancelled` remote | `should_local_win` returns `True` (logged) |
| 52 | `completed` local vs `failed` remote | `should_local_win` returns `True` |
| 53 | `failed` local vs `cancelled` remote | `should_local_win` returns `True` |
| 54 | `processing` local vs `completed` remote | `should_local_win` returns `False` |
| 55 | `queued` local vs `processing` remote | `should_local_win` returns `False` |
| 56 | `queued` local vs `completed` remote | `should_local_win` returns `False` |
| 57 | `queued` local vs `cancelled` remote | `should_local_win` returns `False` |
| 58 | `queued` local vs `failed` remote | `should_local_win` returns `False` |
| 59 | Same rank, local has later `statusUpdatedAt` | `should_local_win` returns `True` |
| 60 | Same rank, remote has later `statusUpdatedAt` | `should_local_win` returns `False` |
| 61 | Non-status change (e.g., `youtubeUrl` only, no `status` in payload) | `should_local_win` returns `True` — always applies |

### C6. Idempotency

| # | Test | What to assert |
|---|------|----------------|
| 62 | Flush the same outbox entry twice (simulate ack lost) | Firestore has only one net update; second flush is a no-op or re-applies same value |
| 63 | A UUID that already succeeded does not create a duplicate side-effect | Final state is same whether flushed once or twice |

### C7. Endpoint behaviour changes

| # | Test | What to assert |
|---|------|----------------|
| 64 | `api_send_to_rover` reads from SQLite mirror (not Firestore) | Monkeypatch `_firestore` to raise; call still works |
| 65 | `api_send_to_rover` rejects non-queued missions from mirror | Mirror row with `status='processing'` → 400 |
| 66 | `api_rerun` rejects non-terminal missions from mirror | Mirror row with `status='queued'` → 400 |
| 67 | `api_mark_complete` writes to mirror+outbox, not Firestore | No Firestore call; mirror shows `completed` |
| 68 | `api_attach_youtube` writes to mirror+outbox, not Firestore | Same pattern |
| 69 | All mutating endpoints return 404 for missing missions (mirror miss) | |

---

## D. Integration / Cross-PR Tests

| # | Test | What to assert |
|---|------|----------------|
| 70 | Full offline lifecycle: send → complete → reconnect → Firestore updated | End-to-end with fake Firestore that first raises then succeeds |
| 71 | `sync_cycle` with 3 outbox entries: all flush in order, then pull runs | Ordered calls verified |
| 72 | Dirty mirror row is NOT overwritten by a pull after flush clears `local_dirty` | Upsert with `WHERE local_dirty = 0` |
| 73 | YouTube poll (`check_for_new_videos`) does not clobber a pending outbox entry for the same mission | Check outbox entry survives the direct Firestore write |

---

## E. Thread Safety & Edge Cases

| # | Test | What to assert |
|---|------|----------------|
| 74 | Two concurrent `write_and_enqueue` calls → both succeed without corruption | No `SQLITE_BUSY`; both rows present |
| 75 | `_db_lock` prevents interleaving of read-modify-write on outbox | Deterministic outcomes under threading |
| 76 | `BEGIN IMMEDIATE` semantics: two threads both try `peek_outbox` + `delete_outbox` → only one deletes | No double-processing |
| 77 | Connection created with `check_same_thread=False` | Verify the connection arg |

---

## F. Regression Tests (existing features still work)

| # | Test | What to assert |
|---|------|----------------|
| 78 | `OPERATOR_AUTH=off` still works with all new endpoints | Offline stub operator accepted |
| 79 | `lockOwner` records the satellite ID (not the stub user) when auth is off | |
| 80 | YouTube poll still functions (direct Firestore write; not broken by new code) | |
| 81 | The `/code/` Blockly interface has no new Firestore dependency | Doesn't import or call `_firestore` |
| 82 | The `/monitor/` TV display has no new Firestore dependency | Same |
| 83 | Existing 146 tests still pass unchanged | Run full suite |

---

## How to Run

```bash
# From the repo root, on the feat/OfflineFirstSync branch:
.venv/bin/python -m pytest yard/satellite/tests yard/rover -q \
  --ignore=yard/satellite/tests/test_blockly_codegen.py \
  --ignore=yard/satellite/tests/test_status_page.py
```

---

## Test Infrastructure Needed

| Component | Purpose |
|-----------|---------|
| `FakeTransaction` | Supports `get(ref, transaction=...)` and `update(ref, fields)`, plus a hook to inject a concurrent write between the read and write (for conflict testing in A1/A2) |
| In-memory SQLite | Use `MISSION_MIRROR_DB=:memory:` or a `tmp_path` fixture to isolate tests |
| Firestore failure injection | Monkeypatch `_firestore()` to raise `Exception` to simulate offline |
| Rover dispatch spy | Count calls to `_dispatch_to_rover` or capture the request body |
| `sync_from_firestore` spy | To assert push-before-pull (C4) |

---

**Total: 83 discrete test cases.** The merge-rule tests (C5) are ideal as a
single `@pytest.mark.parametrize` table-driven test.
