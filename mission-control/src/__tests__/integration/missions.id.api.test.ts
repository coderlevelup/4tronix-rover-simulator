/**
 * Integration Tests for PATCH /api/missions/[id] (Task 61)
 *
 * Tests the complete flow from HTTP request to repository, plus the
 * best-effort status-change email. Uses mocked Firestore (missions +
 * learners collections) and a mocked Resend sender to avoid requiring real
 * credentials or network access.
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
        return { exists: !!data, data: () => data, id };
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

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/missions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/missions/[id] Integration Tests', () => {
  beforeEach(() => {
    missions.clear();
    learners.clear();
    jest.clearAllMocks();

    missions.set('mission-1', {
      yardId: 'yard-1',
      learnerId: 'learner-1',
      sessionId: 'session-1',
      name: 'Orbital Nomad',
      code: 'rover.forward(100)',
      status: 'queued',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('updates the mission status and returns 200', async () => {
    const response = await PATCH(patchRequest('mission-1', { status: 'processing' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mission.status).toBe('processing');
  });

  it('returns 404 for an unknown mission id', async () => {
    const response = await PATCH(patchRequest('does-not-exist', { status: 'processing' }), {
      params: Promise.resolve({ id: 'does-not-exist' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('rejects an invalid status value with 400', async () => {
    const response = await PATCH(patchRequest('mission-1', { status: 'launched' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Validation failed');
  });

  it('rejects unknown fields (schema is strict)', async () => {
    const response = await PATCH(patchRequest('mission-1', { status: 'processing', foo: 'bar' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });

    expect(response.status).toBe(400);
  });

  it('does not send an email when the mission has no learnerEmail', async () => {
    await PATCH(patchRequest('mission-1', { status: 'processing' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends a status email when the mission has a learnerEmail', async () => {
    missions.set('mission-1', {
      yardId: 'yard-1',
      learnerId: 'learner-1',
      sessionId: 'session-1',
      learnerEmail: 'ada@school.edu',
      name: 'Orbital Nomad',
      code: 'rover.forward(100)',
      status: 'queued',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    learners.set('learner-1', { displayName: 'Ada' });

    const response = await PATCH(patchRequest('mission-1', { status: 'completed' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendMock.mock.calls[0];
    expect(to).toBe('ada@school.edu');
    expect(subject).toContain('Orbital Nomad');
    expect(html).toContain('Hi Ada,');
  });

  it('still returns 200 when the email send fails', async () => {
    missions.set('mission-1', {
      yardId: 'yard-1',
      learnerId: 'learner-1',
      sessionId: 'session-1',
      learnerEmail: 'ada@school.edu',
      name: 'Orbital Nomad',
      code: 'rover.forward(100)',
      status: 'queued',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    sendMock.mockRejectedValueOnce(new Error('Resend is down'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await PATCH(patchRequest('mission-1', { status: 'failed' }), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    consoleErrorSpy.mockRestore();
  });
});
