/**
 * Unit Tests for MissionNotificationService
 *
 * Tests notification logic in isolation using a mocked IEmailSender and a
 * minimal Firestore-like stub, mirroring MissionService.test.ts's use of a
 * hand-written mock repository.
 */

import { MissionNotificationService } from '@/core/application/services/MissionNotificationService';
import { IEmailSender } from '@/core/domain/services/IEmailSender';
import { Mission } from '@/core/domain/entities/Mission';

class MockEmailSender implements IEmailSender {
  public calls: Array<{ to: string; subject: string; html: string }> = [];
  private failNext = false;

  async send(to: string, subject: string, html: string): Promise<void> {
    if (this.failNext) {
      throw new Error('Resend is down');
    }
    this.calls.push({ to, subject, html });
  }

  failOnNextSend() {
    this.failNext = true;
  }
}

function makeFirestoreStub(learnerDoc: Record<string, unknown> | undefined) {
  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({
          exists: !!learnerDoc,
          data: () => learnerDoc,
        })),
      })),
    })),
  };
}

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    yardId: 'yard-1',
    learnerId: 'learner-1',
    sessionId: 'session-1',
    name: 'Orbital Nomad',
    code: 'rover.forward(100)',
    status: 'queued',
    submittedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const HISTORY_URL = 'http://localhost:3000/history';

describe('MissionNotificationService', () => {
  it('does nothing when the mission has no learnerEmail', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub(undefined);
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(makeMission({ learnerEmail: undefined }), 'processing');

    expect(sender.calls).toHaveLength(0);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('sends a templated email to the learner for the given status', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(
      makeMission({ learnerEmail: 'ada@school.edu' }),
      'completed'
    );

    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].to).toBe('ada@school.edu');
    expect(sender.calls[0].subject).toContain('Orbital Nomad');
    expect(sender.calls[0].html).toContain('Hi Ada,');
    expect(sender.calls[0].html).toContain(HISTORY_URL);
  });

  it('falls back to the mission id when the mission has no name', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(
      makeMission({ learnerEmail: 'ada@school.edu', name: undefined, id: 'mission-xyz' }),
      'completed'
    );

    expect(sender.calls[0].subject).toContain('mission-xyz');
  });

  it('falls back to "Space Explorer" when the learner has no displayName', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub(undefined);
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(
      makeMission({ learnerEmail: 'ada@school.edu' }),
      'completed'
    );

    expect(sender.calls[0].html).toContain('Hi Space Explorer,');
  });

  it('swallows sender errors instead of throwing', async () => {
    const sender = new MockEmailSender();
    sender.failOnNextSend();
    const firestore = makeFirestoreStub({ displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      service.notifyStatusChange(makeMission({ learnerEmail: 'ada@school.edu' }), 'failed')
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
