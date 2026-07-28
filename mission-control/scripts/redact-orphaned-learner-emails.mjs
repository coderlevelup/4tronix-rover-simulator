#!/usr/bin/env node
/**
 * Companion to migrate-learner-email-hash.mjs.
 *
 * Learner records used to be keyed by getOrCreateSession()'s sessionId, while
 * missions carry getLearnerID()'s learnerId - two different nanoids. Unifying
 * them left behind learner documents that no mission references. Those still
 * hold a plaintext address that can never be used to send anything, because the
 * notification service only ever looks up learners/{mission.learnerId}.
 *
 * This removes the `learnerEmail` field from those unreachable documents.
 *
 * It REDACTS THE FIELD rather than deleting the document: the goal is to stop
 * holding an address nothing can use, and keeping the (now address-less) record
 * costs nothing while avoiding a destructive delete. Deleting the documents
 * themselves, if you want that, is a separate deliberate step.
 *
 * "Referenced" is deliberately generous - a learner id counts as live if it
 * appears as EITHER learnerId or sessionId on any mission, because older
 * missions fall back to sessionId. Better to leave a stale address than to
 * redact one that is still in use.
 *
 * Usage (dry run prints what would change and touches nothing):
 *   cd mission-control
 *   set -a && source .env && set +a
 *   node scripts/redact-orphaned-learner-emails.mjs
 *   node scripts/redact-orphaned-learner-emails.mjs --apply
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

function requireEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    console.error(`Missing ${name}. Source mission-control/.env first.`);
    process.exit(1);
  }
  const trimmed = raw.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;
}

const projectId = requireEnv('FIREBASE_PROJECT_ID');

initializeApp({
  credential: cert({
    projectId,
    clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

const mask = (e) => {
  const [user, domain] = e.split('@');
  if (!domain) return '***';
  const head = user.length > 2 ? user[0] + '*'.repeat(user.length - 2) + user.at(-1) : '**';
  return `${head}@${domain}`;
};

console.log(`project: ${projectId}`);
console.log(APPLY ? 'MODE: APPLY (will write)\n' : 'MODE: DRY RUN (no writes)\n');

// Any learner id a mission points at, by either field.
const missions = await db.collection('missions').get();
const referenced = new Set();
for (const m of missions.docs) {
  const d = m.data();
  if (d.learnerId) referenced.add(d.learnerId);
  if (d.sessionId) referenced.add(d.sessionId);
}

const learners = await db.collection('learners').get();

let live = 0;
let redacted = 0;

for (const learnerDoc of learners.docs) {
  const email = learnerDoc.data()?.learnerEmail;
  if (typeof email !== 'string' || !email.trim()) continue;

  if (referenced.has(learnerDoc.id)) {
    live += 1;
    continue;
  }

  console.log(`  learners/${learnerDoc.id}: redact ${mask(email)} (no mission references this id)`);
  redacted += 1;
  if (APPLY) {
    await learnerDoc.ref.update({ learnerEmail: FieldValue.delete() });
  }
}

console.log(`\nlearner docs scanned:          ${learners.size}`);
console.log(`ids referenced by a mission:   ${referenced.size}`);
console.log(`addresses kept (reachable):    ${live}`);
console.log(`addresses redacted (orphaned): ${redacted}`);

if (!APPLY && redacted > 0) {
  console.log('\nRe-run with --apply to write these changes.');
}
