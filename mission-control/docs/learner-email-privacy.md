# Learner email addresses: where they live and why

## The problem this solves

Mission documents are world-readable. The discovery feed lists them, and the
`NEXT_PUBLIC_FIREBASE_*` web config ships inside the browser bundle by design,
so anyone can read the collection directly. Firestore security rules cannot
filter fields on read: if a field is on a readable document, it is public.

Missions used to carry `learnerEmail` in plaintext. Querying the collection as
an anonymous caller with nothing but the public API key returned:

```
mission docs returned to an anonymous caller: 80
of those, carrying a learnerEmail: 30
distinct addresses harvestable: 4
```

Several were `@myuct.ac.za` addresses, which are surname-initials-plus-student-number
and therefore resolve to a specific named student. POPIA's definition of personal
information names email addresses explicitly, and these are school learners.

## The design

**Missions carry `learnerEmailHash`. They never carry the address.**

- `learnerEmailHash` is `sha256(email.trim().toLowerCase())`, hex encoded.
- The real address lives on `learners/{learnerId}`, which security rules allow
  to be fetched by exact id but **never listed**, so the collection cannot be
  enumerated.
- The browser hashes the address it already knows to find its own missions from
  another device. A feed reader sees an opaque 64-character string.
- The server resolves the address from the learner record when it needs to send.

Implementation: [`src/core/domain/services/learnerEmailHash.ts`](../src/core/domain/services/learnerEmailHash.ts).
It uses Web Crypto, which exists in both browsers and Node 18+, so the exact
same function runs client-side (querying) and server-side (writing).

### Honest limitation

This is pseudonymisation, not anonymisation. Someone who already suspects an
address can hash their guess and confirm it. What it removes is **bulk
harvesting**, which was the actual exposure. Treat the hash as still
identifying, not as anonymous data.

## Where each piece lives now

| Concern | Location |
| --- | --- |
| Address (plaintext) | `learners/{learnerId}.learnerEmail` |
| Address → mission link | `missions/{id}.learnerEmailHash` |
| Display name | `learners/{learnerId}.displayName` |
| Sending an email | server resolves both from the learner record |

**`learners` documents are keyed by `getLearnerID()`**, the same id missions
carry as `learnerId`. They used to be keyed by `getOrCreateSession()`'s
`sessionId` — a *different* nanoid under a different localStorage key — so the
server could never find a mission's learner. That is why every status email
greeted "Hi Space Explorer" instead of the learner's name. Unifying the id was
required to move the address onto the learner record, and fixes the greeting as
a side effect.

Existing documents under the old sessionId key are orphaned. Nothing important
is lost: they hold only an address and display name, and the address is also in
localStorage, so it is rewritten under the correct id the next time the learner
saves it.

## Ordering constraint (easy to break)

In `LearnerContext.setLearnerEmail`, the learner record **must** be written
before `backfillLatestMissionEmail` runs. The backfill triggers a notify, and
the server reads the address back from the learner record. Reverse the order and
that email finds no address and silently skips.

## Migrating existing data

`mission-control/scripts/migrate-learner-email-hash.mjs` moves plaintext
addresses off mission documents. It is idempotent and dry-run by default.

```bash
cd mission-control
set -a && source .env && set +a
node scripts/migrate-learner-email-hash.mjs           # dry run, writes nothing
node scripts/migrate-learner-email-hash.mjs --apply   # perform the migration
```

Per mission it copies the address to `learners/{learnerId}` first, *then*
rewrites the mission. That order matters: if the script dies between the two
steps the mission still has its address and can be retried, whereas the reverse
would lose the ability to reach that learner. Missions with an address but no
`learnerId` are reported and left untouched.

**If the team chooses a fresh start** for the `bt-impact-academy` migration
(Part B step 7 of `infra/README.md`), skip this entirely — the new database
starts clean and no plaintext address ever reaches Impact's project.

### Then clean up the orphaned learner records

Unifying the learner document id left records under the old `sessionId` keys
that no mission references. They still held a plaintext address that nothing
could ever use, since the notification service only reads
`learners/{mission.learnerId}`.

```bash
node scripts/redact-orphaned-learner-emails.mjs           # dry run
node scripts/redact-orphaned-learner-emails.mjs --apply
```

It removes the `learnerEmail` field from unreachable records and leaves the
document itself in place — the goal is to stop holding an address nothing can
use, not to destroy records. A learner id counts as reachable if it appears as
*either* `learnerId` or `sessionId` on any mission, deliberately generous so a
still-in-use address is never redacted.

Run this **after** the hash migration, not before: the hash migration copies
addresses onto learner records, and running the redaction first would strip
addresses that migration is about to make reachable.

### Both scripts have been run against `mars-rover-cloud-platform`

As of 2026-07-27, on the old project: 30 missions migrated to hashes with zero
plaintext addresses left publicly readable, 11 reachable learner records hold
the addresses, 6 orphaned records redacted, and all 30 missions verified to
still resolve to a matching address. The export to Impact will carry hashes.

## Deploying the rules and index together

The rules and the composite index both changed. Deploy them as a pair, and
deploy **before** the app code, so no client can write a plaintext address in
the gap:

```bash
firebase deploy --only firestore --project <project>
```

- `firestore.rules` — the one browser write to a mission is now narrowed to
  `learnerEmailHash`, and validated as a 64-char lowercase hex digest, so the
  write cannot be used to smuggle a plaintext address onto a public document.
- `firestore.indexes.json` — the composite index on `learnerEmail + submittedAt`
  became `learnerEmailHash + submittedAt`. Cross-device history returns nothing
  until this index finishes building.

Verify the rules with the emulator:

```bash
firebase emulators:exec --only firestore --project demo-rules-test \
  'node scripts/firestore-rules-test.mjs'
```

## Branch topology

This work stacks, so merge in order:

```
main
 └── fix/mission-email-delivery      email actually sends at all
      └── feat/hash-learner-email    this change
           (merges in fix/firestore-rules-lockdown)
```

`fix/firestore-rules-lockdown` is merged into this branch so the rules and the
field rename land coherently. Merging the rules branch on its own first is fine;
merging it *after* this one would reintroduce a rule referencing `learnerEmail`.

### Overlap with `feat/MissionLock` (Kamo)

Both branches edit `Mission.ts` and `FirestoreMissionRepository.fromFirestoreDoc`.
A dry-run merge was checked, and **there is no conflict in any mission-control
file** — the two changes touch different parts of those functions and git merges
them cleanly. Kamo adds lock/lease fields; this renames one field.

The only conflict between the branches is `yard/satellite/operator_console.py`,
and it has nothing to do with this change. `feat/MissionLock` forked before the
email work landed and rewrote the three handlers that call
`_notify_mission_control_async`, so it drops all three notify calls. Whoever
resolves that merge must re-add them, or learner emails stop firing on
`processing` and `completed` with nothing failing to indicate it.
