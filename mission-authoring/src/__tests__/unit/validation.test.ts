/**
 * Unit Tests for Mission Schema Validation (Task 39)
 *
 * Tests validation rules for mission submission.
 * Ensures data integrity before persistence.
 */

import { validateMission, createMissionSchema } from '@/infrastructure/validation/schemas';

describe('Mission Schema Validation', () => {
  describe('validateMission', () => {
    it('should accept valid mission data', () => {
      const validData = {
        yardId: 'uct-rover-1',
        learnerId: 'learner-123',
        sessionId: 'test-session-123',
        name: 'Test Mission',
        code: 'rover.forward(100)\nrover.wait(2)',
        challengeId: 'M1-FORWARD',
      };

      const result = validateMission(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
      expect(result.errors).toBeUndefined();
    });

    it('should accept mission without optional challengeId', () => {
      const validData = {
        yardId: 'yard-1',
        learnerId: 'learner-456',
        sessionId: 'session-456',
        name: 'Turn Left Mission',
        code: 'rover.turn_left(50)',  // Updated to use approved command
      };

      const result = validateMission(validData);

      expect(result.success).toBe(true);
      expect(result.data?.challengeId).toBeUndefined();
    });

    it('should reject empty yardId', () => {
      const invalidData = {
        yardId: '',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('yardId: Yard ID is required');
    });

    it('should reject yardId with invalid characters', () => {
      const invalidData = {
        yardId: 'yard@#$%',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Yard ID must contain only alphanumeric characters');
    });

    it('should reject empty sessionId', () => {
      const invalidData = {
        yardId: 'yard-1',
        sessionId: '',
        code: 'rover.forward(100)',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('sessionId: Session ID is required');
    });

    it('should reject empty code', () => {
      const invalidData = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: '',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('code: Code cannot be empty');
    });

    it('should reject code with only whitespace', () => {
      const invalidData = {
        yardId: 'yard-1',
        sessionId: 'session-123',
        code: '   \n\t  ',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('code: Code cannot be only whitespace');
    });

    it('should reject code exceeding maximum length', () => {
      const invalidData = {
        yardId: 'yard-1',
        learnerId: 'learner-123',
        sessionId: 'session-123',
        name: 'Too Long Mission',
        code: 'a'.repeat(10001),
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Code exceeds maximum length');
    });

    it('should reject yardId exceeding maximum length', () => {
      const invalidData = {
        yardId: 'a'.repeat(51),
        sessionId: 'session-123',
        code: 'rover.forward(100)',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('yardId: Yard ID too long');
    });

    it('should reject sessionId exceeding maximum length', () => {
      const invalidData = {
        yardId: 'yard-1',
        sessionId: 'a'.repeat(101),
        code: 'rover.forward(100)',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('sessionId: Session ID too long');
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        yardId: 'yard-1',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidData = {
        yardId: '',
        sessionId: '',
        code: '',
      };

      const result = validateMission(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('createMissionSchema', () => {
    it('should parse valid data with Zod', () => {
      const validData = {
        yardId: 'rover-yard-1',
        learnerId: 'learner_abc123',
        sessionId: 'sess_abc123',
        name: 'Zod Parse Mission',
        code: 'rover.forward(100)\nrover.stop()',
        challengeId: 'LEVEL-1',
      };

      const parsed = createMissionSchema.parse(validData);

      expect(parsed).toEqual(validData);
    });

    it('should throw ZodError for invalid data', () => {
      const invalidData = {
        yardId: 123,
        sessionId: null,
        code: '',
      };

      expect(() => createMissionSchema.parse(invalidData)).toThrow();
    });
  });
});
