import {
  hashLearnerEmail,
  normalizeLearnerEmail,
} from '@/core/domain/services/learnerEmailHash';

describe('learnerEmailHash', () => {
  it('is stable across case and surrounding whitespace', async () => {
    // The browser hashes what the learner typed; the server hashed what was
    // submitted earlier. If these disagreed, cross-device history would
    // silently return nothing.
    const variants = ['Ada@School.edu', '  ada@school.edu  ', 'ADA@SCHOOL.EDU'];
    const hashes = await Promise.all(variants.map(hashLearnerEmail));

    expect(new Set(hashes).size).toBe(1);
  });

  it('produces a 64-character hex sha-256 digest', async () => {
    const hash = await hashLearnerEmail('ada@school.edu');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known sha-256 of the normalized address', async () => {
    // Pins the algorithm: a migration script in another language has to be able
    // to reproduce these hashes exactly.
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update('ada@school.edu').digest('hex');

    await expect(hashLearnerEmail('  Ada@School.edu ')).resolves.toBe(expected);
  });

  it('gives different addresses different hashes', async () => {
    const [a, b] = await Promise.all([
      hashLearnerEmail('ada@school.edu'),
      hashLearnerEmail('grace@school.edu'),
    ]);

    expect(a).not.toBe(b);
  });

  it('does not leak the address into the hash', async () => {
    const hash = await hashLearnerEmail('ada@school.edu');

    expect(hash).not.toContain('ada');
    expect(hash).not.toContain('school');
  });

  it('rejects an empty address rather than hashing nothing', async () => {
    await expect(hashLearnerEmail('   ')).rejects.toThrow('empty learner email');
  });

  it('normalizes independently of hashing', () => {
    expect(normalizeLearnerEmail('  Ada@School.edu ')).toBe('ada@school.edu');
  });
});
