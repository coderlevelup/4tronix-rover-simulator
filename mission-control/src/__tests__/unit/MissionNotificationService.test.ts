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

/**
 * The address now comes from the learner record, not the mission - mission
 * documents are world-readable, so they carry only a hash. These stubs model
 * learners/{learnerId}.
 */
describe('MissionNotificationService', () => {
  it('skips when the learner record has no email', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.notifyStatusChange(makeMission(), 'processing')).resolves.toEqual({
      sent: false,
      reason: 'no-learner-email',
    });

    expect(sender.calls).toHaveLength(0);
    warn.mockRestore();
  });

  it('skips when the learner record does not exist at all', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub(undefined);
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.notifyStatusChange(makeMission(), 'processing')).resolves.toEqual({
      sent: false,
      reason: 'no-learner-email',
    });

    expect(sender.calls).toHaveLength(0);
    warn.mockRestore();
  });

  it('sends a templated email to the address on the learner record', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu', displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await expect(service.notifyStatusChange(makeMission(), 'completed')).resolves.toEqual({
      sent: true,
    });

    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].to).toBe('ada@school.edu');
    expect(sender.calls[0].subject).toContain('Orbital Nomad');
    expect(sender.calls[0].html).toContain('Hi Ada,');
    expect(sender.calls[0].html).toContain(HISTORY_URL);
  });

  it('greets by display name from the same record the address came from', async () => {
    // Regression: the address used to be read off the mission while the name
    // was looked up under a different id, so every email said "Space Explorer".
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu', displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(makeMission(), 'completed');

    expect(sender.calls[0].html).toContain('Hi Ada,');
    expect(sender.calls[0].html).not.toContain('Space Explorer');
  });

  it('falls back to "Space Explorer" when the record has an email but no name', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(makeMission(), 'completed');

    expect(sender.calls[0].html).toContain('Hi Space Explorer,');
  });

  it('falls back to the mission id when the mission has no name', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu', displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);

    await service.notifyStatusChange(makeMission({ name: undefined, id: 'mission-xyz' }), 'completed');

    expect(sender.calls[0].subject).toContain('mission-xyz');
  });

  it('never puts a plaintext address on the mission it reads', async () => {
    const sender = new MockEmailSender();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const mission = makeMission();

    await service.notifyStatusChange(mission, 'completed');

    expect(Object.keys(mission)).not.toContain('learnerEmail');
  });

  it('reports sender errors instead of throwing', async () => {
    const sender = new MockEmailSender();
    sender.failOnNextSend();
    const firestore = makeFirestoreStub({ learnerEmail: 'ada@school.edu', displayName: 'Ada' });
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.notifyStatusChange(makeMission(), 'failed')).resolves.toEqual({
      sent: false,
      reason: 'send-failed',
      error: expect.any(String),
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('reports a failure when the learner lookup itself throws', async () => {
    const sender = new MockEmailSender();
    const firestore = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(async () => {
            throw new Error('Firestore unavailable');
          }),
        })),
      })),
    };
    const service = new MissionNotificationService(sender, firestore as never, HISTORY_URL);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.notifyStatusChange(makeMission(), 'queued')).resolves.toEqual({
      sent: false,
      reason: 'send-failed',
      error: 'Firestore unavailable',
    });

    expect(sender.calls).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});
