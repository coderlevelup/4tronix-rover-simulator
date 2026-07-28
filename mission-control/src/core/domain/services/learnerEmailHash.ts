/**
 * Learner email hashing.
 *
 * Mission documents are world-readable: the discovery feed lists them and the
 * public Firebase web config ships in the browser bundle, so anything stored on
 * a mission is effectively public. Learner email addresses therefore live only
 * on the learner record (gettable by exact id, never listable), and missions
 * carry this one-way hash instead.
 *
 * The hash exists purely so a learner can find their own missions from another
 * device: the browser hashes the address it already knows and queries by that.
 * A feed reader sees an opaque string.
 *
 * This is pseudonymisation, not anonymisation - someone who already suspects an
 * address can confirm it by hashing their guess. What it removes is BULK
 * harvesting, which was the actual exposure.
 *
 * Uses Web Crypto, which is present in browsers and in Node 18+, so the same
 * function runs on both the client (querying) and the server (writing).
 */

/** Case and whitespace must not change the hash, or history lookups miss. */
export function normalizeLearnerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashLearnerEmail(email: string): Promise<string> {
  const normalized = normalizeLearnerEmail(email);

  if (!normalized) {
    throw new Error('Cannot hash an empty learner email');
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
