/**
 * Task 61: completion notification fires after the mission status update.
 *
 * Verifies the PATCH /api/missions/[id] route triggers a status email once
 * a mission transitions to 'completed', using the same mocked Firestore +
 * Resend approach as missions.id.api.test.ts.
 */

import { PATCH } from '@/app/api/missions/[id]/route';
import { NextRequest } from 'next/server';

const sendMock = jest.fn(async (_to: string, _subject: string, _html: string) => {});

jest.mock('@/infrastructure/email/resend-client', () => ({
  ResendEmailSender: jest.fn().mockImplementation(() => ({ send: sendMock })),
}));

jest.mock('@/infrastructure/persistence/firebase-admin', () => ({
  getFirestoreInstance: jest.fn(() => mockFirestore),
}));

type DocData = Record<string, unknown>;

const missions = new Map<string, DocData>();
const learners = new Map<string, DocData>();

function makeQueryChain() {
  const chain: Record<string, jest.Mock> = {};
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.count = jest.fn(() => ({
    get: jest.fn(async () => ({ data: () => ({ count: 0 }) })),
  }));
  chain.get = jest.fn(async () => ({ docs: [] }));
  return chain;
}

function makeCollection(store: Map<string, DocData>) {
  const chain = makeQueryChain();

  return {
    doc: jest.fn((id: string) => ({
      get: jest.fn(async () => {
        const data = store.get(id);
        return { exists: () => !!data, data: () => data, id };
      }),
      set: jest.fn(async (data: DocData) => {
        store.set(id, data);
      }),
      update: jest.fn(async (updates: DocData) => {
        const existing = store.get(id) ?? {};
        store.set(id, { ...existing, ...updates });
      }),
    })),
    where: chain.where,
    orderBy: chain.orderBy,
  };
}

const mockFirestore = {
  collection: jest.fn((name: string) => (name === 'learners' ? makeCollection(learners) : makeCollection(missions))),
};

describe('completion notification', () => {
  beforeEach(() => {
    missions.clear();
    learners.clear();
    jest.clearAllMocks();

    missions.set('mission-1', {
      yardId: 'yard-1',
      learnerId: 'learner-1',
      sessionId: 'session-1',
      learnerEmail: 'ada@school.edu',
      name: 'Orbital Nomad',
      code: 'rover.forward(100)',
      status: 'processing',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('fires a completion email after the mission status update', async () => {
    const request = new NextRequest('http://localhost:3000/api/missions/mission-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'mission-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mission.status).toBe('completed');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const [to, subject] = sendMock.mock.calls[0];
    expect(to).toBe('ada@school.edu');
    expect(subject).toContain('Mission Complete');
  });
});
