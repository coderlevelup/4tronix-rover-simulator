import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import type { Firestore } from 'firebase/firestore';

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'testmissionid12345'),
}));

describe('FirestoreMissionRepository', () => {
  it('omits undefined fields before writing to Firestore', async () => {
    const set = jest.fn(async () => Promise.resolve());
    const countGet = jest.fn(async () => Promise.resolve({ data: () => ({ count: 0 }) }));

    const firestore = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set,
        })),
        where: jest.fn(() => ({
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              count: jest.fn(() => ({
                get: countGet,
              })),
            })),
          })),
        })),
      })),
    } as unknown as Firestore;

    const repository = new FirestoreMissionRepository(firestore);

    await repository.create({
      yardId: 'yard-1',
      sessionId: 'session-1',
      learnerUid: undefined,
      code: 'rover.forward(100)',
      challengeId: undefined,
      status: 'queued',
      executionResult: {
        isSuccessful: false,
        consoleOutput: 'output',
        errorMessage: undefined,
      },
      videoUrl: undefined,
      youtubeUrl: undefined,
      submittedAt: new Date().toISOString(),
      startedAt: undefined,
      completedAt: undefined,
    });

    expect(set).toHaveBeenCalledTimes(1);

    const writtenMission = set.mock.calls[0][0];

    expect(writtenMission).toMatchObject({
      yardId: 'yard-1',
      sessionId: 'session-1',
      code: 'rover.forward(100)',
      status: 'queued',
      executionResult: {
        isSuccessful: false,
        consoleOutput: 'output',
      },
    });

    expect(writtenMission).not.toHaveProperty('challengeId');
    expect(writtenMission).not.toHaveProperty('learnerUid');
    expect(writtenMission).not.toHaveProperty('videoUrl');
    expect(writtenMission).not.toHaveProperty('youtubeUrl');
    expect(writtenMission).not.toHaveProperty('startedAt');
    expect(writtenMission).not.toHaveProperty('completedAt');
    expect(writtenMission.executionResult).not.toHaveProperty('errorMessage');
  });

  it('strips comments from mission code before writing to Firestore', async () => {
    const set = jest.fn(async () => Promise.resolve());
    const countGet = jest.fn(async () => Promise.resolve({ data: () => ({ count: 0 }) }));

    const firestore = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set,
        })),
        where: jest.fn(() => ({
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              count: jest.fn(() => ({
                get: countGet,
              })),
            })),
          })),
        })),
      })),
    } as unknown as Firestore;

    const repository = new FirestoreMissionRepository(firestore);

    await repository.create({
      yardId: 'yard-1',
      sessionId: 'session-1',
      learnerUid: undefined,
      code: '# comment line\nrover.forward(100)  # move\n\n# another comment\nrover.stop()',
      challengeId: undefined,
      status: 'queued',
      executionResult: {
        isSuccessful: false,
        consoleOutput: 'output',
        errorMessage: undefined,
      },
      videoUrl: undefined,
      youtubeUrl: undefined,
      submittedAt: new Date().toISOString(),
      startedAt: undefined,
      completedAt: undefined,
    });

    const writtenMission = set.mock.calls[0][0];

    expect(writtenMission.code).toBe('rover.forward(100)\nrover.stop()');
    expect(writtenMission.id).toBe('testmissionid12345');
  });
});
