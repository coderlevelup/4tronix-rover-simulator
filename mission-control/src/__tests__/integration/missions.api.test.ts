/**
 * Integration Tests for POST /api/missions (Tasks 40 & 41)
 *
 * Tests the complete flow from HTTP request to repository.
 * Uses mocked Firestore to avoid requiring real Firebase credentials.
 */

import { POST } from '@/app/api/missions/route';
import { NextRequest } from 'next/server';

jest.mock('@/infrastructure/persistence/firebase-admin', () => ({
  getFirestoreInstance: jest.fn(() => mockFirestore),
}));

type MissionRecord = Record<string, unknown>;

const mockMissions = new Map<string, MissionRecord>();

const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn((id?: string) => ({
      set: jest.fn(async (data: MissionRecord) => {
        const docId = id || `mock-${Date.now()}`;
        mockMissions.set(docId, data);
        return Promise.resolve();
      }),
      get: jest.fn(async () => {
        const data = id ? mockMissions.get(id) : undefined;
        return Promise.resolve({
          exists: !!data,
          data: () => data,
          id,
        });
      }),
    })),
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          count: jest.fn(() => ({
            get: jest.fn(async () =>
              Promise.resolve({ data: () => ({ count: 0 }) })
            ),
          })),
        })),
        count: jest.fn(() => ({
          get: jest.fn(async () =>
            Promise.resolve({ data: () => ({ count: 0 }) })
          ),
        })),
      })),
      count: jest.fn(() => ({
        get: jest.fn(async () =>
          Promise.resolve({ data: () => ({ count: 0 }) })
        ),
      })),
    })),
  })),
};

let idCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => `test-id-${++idCounter}`),
}));

describe('POST /api/missions Integration Tests', () => {
  beforeEach(() => {
    mockMissions.clear();
    jest.clearAllMocks();
  });

  describe('Task 40: Valid submission enters queue', () => {
    it('should accept valid mission and return 201 with mission data', async () => {
      const validPayload = {
        yardId: 'uct-rover-1',
        sessionId: 'test-session-123',
        learnerId: 'test-learner',
        name: 'Test Mission',
        code: 'rover.forward(100)\nrover.wait(2)',
        challengeId: 'M1-FORWARD',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.mission).toBeDefined();
      expect(data.mission.id).toBeDefined();
      expect(data.mission.yardId).toBe('uct-rover-1');
      expect(data.mission.sessionId).toBe('test-session-123');
      expect(data.mission.code).toBe('rover.forward(100)\nrover.wait(2)');
      expect(data.mission.status).toBe('queued');
      // Deliberately NOT queuePosition/estimatedWait. Computing them cost a
      // COUNT aggregation on every submission and nothing has ever rendered
      // them. If a "you are 3rd in line" feature is wanted, getQueuedMissions
      // derives the position from an already-ordered result for free.
      expect(data.mission.queuePosition).toBeUndefined();
    });

    it('should accept mission without optional challengeId', async () => {
      const validPayload = {
        yardId: 'rover-yard-2',
        sessionId: 'session-456',
        learnerId: 'test-learner',
        name: 'Test Mission',
        code: 'rover.turn_left(50)',  // Updated to use approved command
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.mission.challengeId).toBeUndefined();
    });

    it('should store mission in Firestore', async () => {
      const validPayload = {
        yardId: 'yard-1',
        sessionId: 'session-789',
        learnerId: 'test-learner',
        name: 'Test Mission',
        code: 'rover.backward(75)',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      await POST(request);

      expect(mockFirestore.collection).toHaveBeenCalledWith('missions');
    });

    it('should generate unique mission ID', async () => {
      const validPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        learnerId: 'test-learner',
        name: 'Test Mission',
        code: 'rover.forward(100)',
      };

      const request1 = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      const request2 = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      const response1 = await POST(request1);
      const data1 = await response1.json();

      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(data1.mission.id).not.toBe(data2.mission.id);
    });

    it('should set submittedAt timestamp', async () => {
      const validPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        learnerId: 'test-learner',
        name: 'Test Mission',
        code: 'rover.forward(100)',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.mission.submittedAt).toBeDefined();
      expect(new Date(data.mission.submittedAt)).toBeInstanceOf(Date);
    });
  });

  describe('Task 41: Invalid code rejected with error message', () => {
    it('should reject empty code with 400 and error message', async () => {
      const invalidPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: '',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toBeDefined();
      expect(data.details).toContain('code: Code cannot be empty');
    });

    it('should reject whitespace-only code', async () => {
      const invalidPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: '   \n\t  ',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.details).toContain('code: Code cannot be only whitespace');
    });

    it('should reject missing required fields', async () => {
      const invalidPayload = {
        yardId: 'yard-1',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
      expect(data.details.length).toBeGreaterThan(0);
    });

    it('should reject empty yardId', async () => {
      const invalidPayload = {
        yardId: '',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.details).toContain('yardId: Yard ID is required');
    });

    it('should reject invalid yardId format', async () => {
      const invalidPayload = {
        yardId: 'yard@invalid!',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject code exceeding maximum length', async () => {
      const invalidPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: 'a'.repeat(10001),
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return multiple validation errors for multiple invalid fields', async () => {
      const invalidPayload = {
        yardId: '',
        sessionId: '',
        code: '',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.details.length).toBeGreaterThanOrEqual(3);
    });

    it('should not store invalid mission in Firestore', async () => {
      const invalidPayload = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: '',
      };

      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      });

      await POST(request);

      expect(mockMissions.size).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should return 500 for malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/missions', {
        method: 'POST',
        body: 'invalid-json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
