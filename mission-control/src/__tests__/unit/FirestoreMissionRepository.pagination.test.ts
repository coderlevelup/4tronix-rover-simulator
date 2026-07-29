/**
 * Cursor pagination for the discovery feed.
 *
 * Offset pagination is not an option: Firestore bills every document an offset
 * skips over, so page 5 would cost five pages' worth of reads. These pin the
 * cursor behaviour, including the tie case that a submittedAt-only cursor gets
 * silently wrong.
 */

import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { Mission } from '@/core/domain/entities/Mission';

type Row = { id: string; data: Record<string, unknown> };

/** Minimal admin-shaped Firestore that supports the query chain under test. */
function makeFirestore(rows: Row[], meter = { docsRead: 0 }) {
  const build = (state: {
    orderFields: Array<{ field: string; dir: string }>;
    after?: [string, string];
    max?: number;
  }) => ({
    orderBy(field: string, dir: string) {
      return build({ ...state, orderFields: [...state.orderFields, { field, dir }] });
    },
    startAfter(submittedAt: string, id: string) {
      return build({ ...state, after: [submittedAt, id] });
    },
    limit(max: number) {
      return build({ ...state, max });
    },
    async get() {
      let out = [...rows].sort((a, b) => {
        const byDate = String(b.data.submittedAt).localeCompare(String(a.data.submittedAt));
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });

      if (state.after) {
        const [ts, id] = state.after;
        const idx = out.findIndex((r) => r.data.submittedAt === ts && r.id === id);
        out = idx === -1 ? out : out.slice(idx + 1);
      }
      if (state.max !== undefined) out = out.slice(0, state.max);

      meter.docsRead += out.length;
      return { docs: out.map((r) => ({ id: r.id, data: () => r.data })) };
    },
  });

  return {
    collection: () => build({ orderFields: [] }),
    meter,
  };
}

const row = (id: string, submittedAt: string): Row => ({
  id,
  data: { yardId: 'uct-rover-1', status: 'completed', code: 'forward(50)', submittedAt },
});

describe('findRecent pagination', () => {
  it('walks every mission exactly once across pages', async () => {
    const rows = Array.from({ length: 80 }, (_, i) =>
      row(`m${i}`, `2026-07-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`)
    );
    const db = makeFirestore(rows);
    const repo = new FirestoreMissionRepository(db as never);

    const seen: Mission[] = [];
    let cursor = undefined as undefined | { submittedAt: string; id: string };
    let pages = 0;

    do {
      const page = await repo.findRecent(24, cursor);
      seen.push(...page.missions);
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 20);

    const ids = seen.map((m) => m.id);
    expect(ids).toHaveLength(80);
    expect(new Set(ids).size).toBe(80);
    expect(pages).toBe(4);
  });

  it('reads only one document more than the page size', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(`m${i}`, `2026-07-01T08:${String(i % 60).padStart(2, '0')}:00.000Z`));
    const meter = { docsRead: 0 };
    const repo = new FirestoreMissionRepository(makeFirestore(rows, meter) as never);

    await repo.findRecent(24);

    // The +1 detects whether another page exists without a count query.
    expect(meter.docsRead).toBe(25);
  });

  it('does not skip or repeat missions that share a submittedAt', async () => {
    // A cursor keyed only on submittedAt loses its place here.
    const rows = Array.from({ length: 10 }, (_, i) => row(`tie${i}`, '2026-07-14T08:00:00.000Z'));
    const repo = new FirestoreMissionRepository(makeFirestore(rows) as never);

    const first = await repo.findRecent(4);
    const second = await repo.findRecent(4, first.nextCursor!);
    const third = await repo.findRecent(4, second.nextCursor!);

    const ids = [...first.missions, ...second.missions, ...third.missions].map((m) => m.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('reports no next cursor on the last page', async () => {
    const repo = new FirestoreMissionRepository(
      makeFirestore([row('a', '2026-07-02T08:00:00.000Z'), row('b', '2026-07-01T08:00:00.000Z')]) as never
    );

    const page = await repo.findRecent(24);

    expect(page.missions).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page rather than throwing when there is nothing', async () => {
    const repo = new FirestoreMissionRepository(makeFirestore([]) as never);

    const page = await repo.findRecent(24);

    expect(page.missions).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('soft-deleted missions', () => {
  const deletedRow = (id: string, submittedAt: string): Row => ({
    id,
    data: {
      yardId: 'uct-rover-1',
      status: 'completed',
      code: 'forward(50)',
      submittedAt,
      deleted: true,
      deletedAt: '2026-07-29T10:00:00.000Z',
    },
  });

  it('are kept out of the feed', async () => {
    const repo = new FirestoreMissionRepository(
      makeFirestore([
        row('visible', '2026-07-03T08:00:00.000Z'),
        deletedRow('removed', '2026-07-02T08:00:00.000Z'),
      ]) as never
    );

    const page = await repo.findRecent(24);

    expect(page.missions.map((m) => m.id)).toEqual(['visible']);
  });

  it('read as absent by id, so a shared link 404s', async () => {
    const rows = [deletedRow('removed', '2026-07-02T08:00:00.000Z')];
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => rows[0].data }),
        }),
        orderBy() { return this; },
        limit() { return this; },
        async get() { return { docs: [] }; },
      }),
    };

    const repo = new FirestoreMissionRepository(db as never);

    await expect(repo.findById('removed')).resolves.toBeNull();
  });
});
