/**
 * Unit Tests: Learner Entity
 */

import {
  createAnonymousLearner,
  isActiveLearner,
  sanitizeDisplayName,
} from '@/core/domain/entities/Learner';

describe('Learner Entity', () => {
  describe('createAnonymousLearner', () => {
    it('creates a learner with valid defaults', () => {
      const sessionId = 'test-session-123';
      const learner = createAnonymousLearner(sessionId);

      expect(learner.id).toBe(sessionId);
      expect(learner.sessionId).toBe(sessionId);
      expect(learner.missionCount).toBe(0);
      expect(learner.completedMissions).toBe(0);
      expect(learner.devices).toHaveLength(1);
      expect(learner.devices[0].sessionId).toBe(sessionId);
    });

    it('assigns a random avatar color', () => {
      const learner = createAnonymousLearner('test-123');

      expect(learner.avatarColor).toBeDefined();
      expect(learner.avatarColor).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('sets timestamps correctly', () => {
      const before = new Date().getTime();
      const learner = createAnonymousLearner('test-123');
      const after = new Date().getTime();

      const createdTime = new Date(learner.createdAt).getTime();

      expect(createdTime).toBeGreaterThanOrEqual(before);
      expect(createdTime).toBeLessThanOrEqual(after);
      expect(learner.lastActiveAt).toBe(learner.createdAt);
    });

    it('initializes device array with first device', () => {
      const sessionId = 'test-123';
      const learner = createAnonymousLearner(sessionId);

      expect(learner.devices).toHaveLength(1);
      expect(learner.devices[0]).toEqual({
        sessionId,
        firstSeenAt: learner.createdAt,
        lastSeenAt: learner.createdAt,
      });
    });
  });

  describe('isActiveLearner', () => {
    it('returns false for new learner with no missions', () => {
      const learner = createAnonymousLearner('test-123');

      expect(isActiveLearner(learner)).toBe(false);
    });

    it('returns true for learner with missions', () => {
      const learner = createAnonymousLearner('test-123');
      learner.missionCount = 5;

      expect(isActiveLearner(learner)).toBe(true);
    });

    it('returns true even with zero completions', () => {
      const learner = createAnonymousLearner('test-123');
      learner.missionCount = 1;
      learner.completedMissions = 0;

      expect(isActiveLearner(learner)).toBe(true);
    });
  });

  describe('sanitizeDisplayName', () => {
    it('removes email addresses', () => {
      const input = 'contact me at test@example.com';
      const sanitized = sanitizeDisplayName(input);

      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).toBe('contact me at');
    });

    it('trims whitespace', () => {
      const input = '  RoverPilot  ';
      const sanitized = sanitizeDisplayName(input);

      expect(sanitized).toBe('RoverPilot');
    });

    it('limits length to 20 characters', () => {
      const input = 'ThisIsAVeryLongNicknameThatExceedsTheLimit';
      const sanitized = sanitizeDisplayName(input);

      expect(sanitized).toHaveLength(20);
      expect(sanitized).toBe('ThisIsAVeryLongNickn');
    });

    it('handles multiple emails', () => {
      const input = 'email test@example.com or admin@site.org';
      const sanitized = sanitizeDisplayName(input);

      expect(sanitized).not.toContain('@');
    });

    it('preserves valid nicknames', () => {
      const validNames = [
        'RoverPilot123',
        'Mars_Explorer',
        'Commander_X',
        'Pilot-42',
      ];

      validNames.forEach((name) => {
        const sanitized = sanitizeDisplayName(name);
        expect(sanitized).toBe(name);
      });
    });

    it('handles empty string', () => {
      const sanitized = sanitizeDisplayName('');

      expect(sanitized).toBe('');
    });

    it('handles only whitespace', () => {
      const sanitized = sanitizeDisplayName('   ');

      expect(sanitized).toBe('');
    });
  });

  describe('Learner statistics', () => {
    it('calculates success rate correctly', () => {
      const learner = createAnonymousLearner('test-123');
      learner.missionCount = 10;
      learner.completedMissions = 8;

      const successRate = (learner.completedMissions / learner.missionCount) * 100;

      expect(successRate).toBe(80);
    });

    it('handles zero missions for success rate', () => {
      const learner = createAnonymousLearner('test-123');

      const successRate =
        learner.missionCount > 0
          ? (learner.completedMissions / learner.missionCount) * 100
          : 0;

      expect(successRate).toBe(0);
    });

    it('handles perfect success rate', () => {
      const learner = createAnonymousLearner('test-123');
      learner.missionCount = 5;
      learner.completedMissions = 5;

      const successRate = (learner.completedMissions / learner.missionCount) * 100;

      expect(successRate).toBe(100);
    });
  });

  describe('Multi-device support', () => {
    it('can track multiple devices', () => {
      const learner = createAnonymousLearner('test-123');

      learner.devices.push({
        sessionId: 'device-2',
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });

      expect(learner.devices).toHaveLength(2);
    });

    it('maintains device history', () => {
      const learner = createAnonymousLearner('test-123');
      const device1Time = learner.devices[0].firstSeenAt;

      // Simulate second device
      const laterTime = new Date(Date.now() + 1000).toISOString();
      learner.devices.push({
        sessionId: 'device-2',
        firstSeenAt: laterTime,
        lastSeenAt: laterTime,
      });

      expect(new Date(learner.devices[1].firstSeenAt).getTime()).toBeGreaterThan(
        new Date(device1Time).getTime()
      );
    });
  });
});
