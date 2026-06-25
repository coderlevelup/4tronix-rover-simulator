/**
 * Unit Tests: getLearnerID Utility
 *
 * @jest-environment jsdom
 */

import { getLearnerID, clearLearnerID, hasLearnerID } from '@/lib/getLearnerID';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('getLearnerID Utility', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getLearnerID', () => {
    it('generates a new ID if none exists', () => {
      const id = getLearnerID();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(21); // nanoid default length
    });

    it('reuses existing ID if found in localStorage', () => {
      const firstId = getLearnerID();
      const secondId = getLearnerID();

      expect(secondId).toBe(firstId);
    });

    it('stores ID in localStorage', () => {
      const id = getLearnerID();
      const stored = localStorage.getItem('mars-rover-learner-id');

      expect(stored).toBe(id);
    });

    it('generates unique IDs on each call after clearing', () => {
      const id1 = getLearnerID();
      clearLearnerID();
      const id2 = getLearnerID();

      expect(id1).not.toBe(id2);
    });
  });

  describe('clearLearnerID', () => {
    it('removes ID from localStorage', () => {
      getLearnerID();
      expect(hasLearnerID()).toBe(true);

      clearLearnerID();

      expect(hasLearnerID()).toBe(false);
    });
  });

  describe('hasLearnerID', () => {
    it('returns false when no ID exists', () => {
      expect(hasLearnerID()).toBe(false);
    });

    it('returns true when ID exists', () => {
      getLearnerID();
      expect(hasLearnerID()).toBe(true);
    });

    it('returns false after clearing', () => {
      getLearnerID();
      clearLearnerID();
      expect(hasLearnerID()).toBe(false);
    });
  });

  describe('ID uniqueness', () => {
    it('generates collision-resistant IDs', () => {
      const ids = new Set<string>();

      // Generate 100 IDs
      for (let i = 0; i < 100; i++) {
        clearLearnerID();
        const id = getLearnerID();
        ids.add(id);
      }

      // All should be unique
      expect(ids.size).toBe(100);
    });
  });

  describe('ID persistence', () => {
    it('persists across multiple calls', () => {
      const originalId = getLearnerID();

      // Call multiple times
      const calls = Array.from({ length: 10 }, () => getLearnerID());

      // All should return the same ID
      expect(calls.every((id) => id === originalId)).toBe(true);
    });
  });
});
