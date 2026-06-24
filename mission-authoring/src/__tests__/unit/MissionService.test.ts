/**
 * Unit Tests for MissionService
 *
 * Tests business logic layer in isolation using mocked repository.
 * Demonstrates Repository pattern benefits for testability.
 */

import { MissionService } from '@/core/application/services/MissionService';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';
import { Mission } from '@/core/domain/entities/Mission';
import { CreateMissionDto } from '@/infrastructure/validation/schemas';

class MockMissionRepository implements IMissionRepository {
  private missions: Map<string, Mission> = new Map();
  private idCounter = 0;

  async create(mission: Omit<Mission, 'id' | 'queuePosition' | 'estimatedWait'>): Promise<Mission> {
    const id = `mock-id-${++this.idCounter}`;
    const newMission: Mission = {
      ...mission,
      id,
      queuePosition: 1,
      estimatedWait: 0,
    };
    this.missions.set(id, newMission);
    return newMission;
  }

  async findById(id: string): Promise<Mission | null> {
    return this.missions.get(id) || null;
  }

  async findByLearnerId(learnerId: string): Promise<Mission[]> {
    return Array.from(this.missions.values())
      .filter((m) => m.learnerId === learnerId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async findBySessionId(sessionId: string): Promise<Mission[]> {
    return Array.from(this.missions.values())
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async getQueuedMissions(yardId: string): Promise<Mission[]> {
    return Array.from(this.missions.values())
      .filter((m) => m.yardId === yardId && m.status === 'queued')
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  async update(id: string, updates: Partial<Mission>): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission) return null;

    const updated = { ...mission, ...updates };
    this.missions.set(id, updated);
    return updated;
  }

  async getQueueLength(yardId: string): Promise<number> {
    return Array.from(this.missions.values()).filter(
      (m) => m.yardId === yardId && m.status === 'queued'
    ).length;
  }

  async findAll(): Promise<Mission[]> {
    return Array.from(this.missions.values()).sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt)
    );
  }

  clear() {
    this.missions.clear();
  }
}

/**
 * Build a fully-typed CreateMissionDto, filling required fields with defaults
 * so individual tests only specify what they care about.
 */
const makeDto = (
  overrides: Partial<CreateMissionDto> & { yardId: string; code: string }
): CreateMissionDto => ({
  learnerId: 'learner-123',
  sessionId: 'session-123',
  name: 'Test Mission',
  ...overrides,
});

describe('MissionService', () => {
  let service: MissionService;
  let repository: MockMissionRepository;

  beforeEach(() => {
    repository = new MockMissionRepository();
    service = new MissionService(repository);
  });

  describe('submitMission', () => {
    it('should successfully submit a mission', async () => {
      const result = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );

      expect(result.success).toBe(true);
      expect(result.mission).toBeDefined();
      expect(result.mission?.yardId).toBe('yard-1');
      expect(result.mission?.learnerId).toBe('learner-123');
      expect(result.mission?.code).toBe('rover.forward(100)');
      expect(result.mission?.status).toBe('queued');
      expect(result.mission?.id).toBeDefined();
    });

    it('should submit a minimal mission', async () => {
      const result = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.spinLeft(50)' })
      );

      expect(result.success).toBe(true);
      expect(result.mission?.code).toBe('rover.spinLeft(50)');
    });

    it('should set initial status to queued', async () => {
      const result = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );

      expect(result.mission?.status).toBe('queued');
    });

    it('should include queue position and estimated wait', async () => {
      const result = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );

      expect(result.mission?.queuePosition).toBeDefined();
      expect(result.mission?.estimatedWait).toBeDefined();
    });
  });

  describe('getMissionById', () => {
    it('should retrieve existing mission', async () => {
      const submitted = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );
      const retrieved = await service.getMissionById(submitted.mission!.id);

      expect(retrieved).toEqual(submitted.mission);
    });

    it('should return null for non-existent mission', async () => {
      const retrieved = await service.getMissionById('non-existent-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('getMissionHistory', () => {
    it('should retrieve all missions for a learner', async () => {
      await service.submitMission(
        makeDto({ yardId: 'yard-1', learnerId: 'learner-123', code: 'rover.forward(100)' })
      );

      await service.submitMission(
        makeDto({ yardId: 'yard-2', learnerId: 'learner-123', code: 'rover.backward(50)' })
      );

      const history = await service.getMissionHistory('learner-123');

      expect(history).toHaveLength(2);
      expect(history.every((m) => m.learnerId === 'learner-123')).toBe(true);
    });

    it('should return empty array for learner with no missions', async () => {
      const history = await service.getMissionHistory('unknown-learner');

      expect(history).toEqual([]);
    });

    it('should not return missions from other learners', async () => {
      await service.submitMission(
        makeDto({ yardId: 'yard-1', learnerId: 'learner-123', code: 'rover.forward(100)' })
      );

      await service.submitMission(
        makeDto({ yardId: 'yard-1', learnerId: 'learner-456', code: 'rover.backward(50)' })
      );

      const history = await service.getMissionHistory('learner-123');

      expect(history).toHaveLength(1);
      expect(history[0].learnerId).toBe('learner-123');
    });
  });

  describe('getQueueForYard', () => {
    it('should retrieve all queued missions for a yard', async () => {
      await service.submitMission(
        makeDto({ yardId: 'yard-1', learnerId: 'learner-123', code: 'rover.forward(100)' })
      );

      await service.submitMission(
        makeDto({ yardId: 'yard-1', learnerId: 'learner-456', code: 'rover.backward(50)' })
      );

      const queue = await service.getQueueForYard('yard-1');

      expect(queue).toHaveLength(2);
      expect(queue.every((m) => m.yardId === 'yard-1')).toBe(true);
      expect(queue.every((m) => m.status === 'queued')).toBe(true);
    });

    it('should not return missions from other yards', async () => {
      await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );

      await service.submitMission(
        makeDto({ yardId: 'yard-2', code: 'rover.backward(50)' })
      );

      const queue = await service.getQueueForYard('yard-1');

      expect(queue).toHaveLength(1);
      expect(queue[0].yardId).toBe('yard-1');
    });
  });

  describe('updateMission', () => {
    it('should update mission status', async () => {
      const submitted = await service.submitMission(
        makeDto({ yardId: 'yard-1', code: 'rover.forward(100)' })
      );

      const updated = await service.updateMission(submitted.mission!.id, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      expect(updated?.status).toBe('processing');
      expect(updated?.startedAt).toBeDefined();
    });

    it('should return null for non-existent mission', async () => {
      const updated = await service.updateMission('non-existent-id', {
        status: 'completed',
      });

      expect(updated).toBeNull();
    });
  });
});
