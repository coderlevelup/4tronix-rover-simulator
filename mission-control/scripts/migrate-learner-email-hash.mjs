#!/usr/bin/env node
/**
 * One-off migration: replace plaintext `learnerEmail` on mission documents with
 * `learnerEmailHash`, and make sure the address survives on the learner record
 * (which is where the notification service now reads it from).
 *
 * Mission documents are world-readable, so every plaintext address on one is
 * public. This removes them.
 *
 * Runs in two passes per mission:
 *   1. copy the address to learners/{learnerId}.learnerEmail if absent there
 *   2. set learnerEmailHash and delete learnerEmail on the mission
 *
 * Pass 1 comes first deliberately: if the script dies between the two, a
 * mission still has its address and can be retried. The reverse order would
 * lose the ability to reach that learner.
 *
 * Usage (dry run prints what would change and touches nothing):
 *   cd mission-control
 *   set -a && source .env && set +a
 *   node scripts/migrate-learner-email-hash.mjs
 *   node scripts/migrate-learner-email-hash.mjs --apply
 *
 * Uses FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY, the
 * same variables mission-control and the yard satellite already read.
 */

import { createHash } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// Must match mission-control/src/core/domain/services/learnerEmailHash.ts.
// That module's test pins this exact algorithm against node:crypto.
const hashEmail = (email) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

function requireEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    console.error(`Missing ${name}. Source mission-control/.env first.`);
    process.exit(1);
  }
  const trimmed = raw.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted;
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

const missions = await db.collection('missions').get();

let withEmail = 0;
let learnerUpdates = 0;
let missionUpdates = 0;
const problems = [];

for (const missionDoc of missions.docs) {
  const data = missionDoc.data();
  const email = data.learnerEmail;
  if (typeof email !== 'string' || !email.trim()) continue;

  withEmail += 1;
  const learnerId = data.learnerId || data.sessionId;

  if (!learnerId) {
    // Nothing to attach the address to; hashing would orphan the learner.
    problems.push(`${missionDoc.id}: has an address but no learnerId`);
    continue;
  }

  const learnerRef = db.collection('learners').doc(learnerId);
  const learnerSnap = await learnerRef.get();
  const learnerHasEmail = learnerSnap.exists && learnerSnap.data()?.learnerEmail;

  if (!learnerHasEmail) {
    console.log(`  learners/${learnerId} <- ${mask(email)}`);
    learnerUpdates += 1;
    if (APPLY) {
      await learnerRef.set(
        { learnerEmail: email.trim(), lastActiveAt: new Date().toISOString() },
        { merge: true }
      );
    }
  }

  console.log(`  missions/${missionDoc.id}: ${mask(email)} -> hash`);
  missionUpdates += 1;
  if (APPLY) {
    await missionDoc.ref.update({
      learnerEmailHash: hashEmail(email),
      learnerEmail: FieldValue.delete(),
    });
  }
}

console.log(`\nmissions scanned:            ${missions.size}`);
console.log(`carrying a plaintext address: ${withEmail}`);
console.log(`learner records to backfill:  ${learnerUpdates}`);
console.log(`missions to rewrite:          ${missionUpdates}`);

if (problems.length) {
  console.log(`\nNEEDS ATTENTION (${problems.length}):`);
  for (const p of problems) console.log('  ' + p);
  console.log('These keep their plaintext address until resolved.');
}

if (!APPLY && missionUpdates > 0) {
  console.log('\nRe-run with --apply to write these changes.');
}
