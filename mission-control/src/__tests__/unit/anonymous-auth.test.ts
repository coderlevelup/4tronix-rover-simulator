/**
 * Unit Tests: Anonymous Authentication Service
 *
 * @jest-environment jsdom
 */

import {
  getOrCreateSession,
  getCurrentSessionId,
  clearSession,
  isStorageAvailable,
  getShortSessionId,
} from '@/lib/anonymous-auth';

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

describe('Anonymous Authentication', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getOrCreateSession', () => {
    it('creates a new session if none exists', () => {
      const session = getOrCreateSession();

      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('createdAt');
      expect(session.sessionId).toHaveLength(21); // nanoid default length
      expect(new Date(session.createdAt).getTime()).toBeGreaterThan(0);
    });

    it('retrieves existing session if available', () => {
      const firstSession = getOrCreateSession();
      const secondSession = getOrCreateSession();

      expect(secondSession.sessionId).toBe(firstSession.sessionId);
      expect(secondSession.createdAt).toBe(firstSession.createdAt);
    });

    it('includes browser fingerprint', () => {
      const session = getOrCreateSession();

      expect(session.fingerprint).toBeDefined();
      expect(typeof session.fingerprint).toBe('string');
      expect(session.fingerprint!.length).toBeGreaterThan(0);
    });

    it('handles corrupted localStorage gracefully', () => {
      // Corrupt the stored data
      localStorageMock.setItem('mars-rover-session-id', 'invalid-json');

      const session = getOrCreateSession();

      expect(session).toHaveProperty('sessionId');
      expect(session.sessionId).toHaveLength(21);
    });
  });

  describe('getCurrentSessionId', () => {
    it('returns null if no session exists', () => {
      const sessionId = getCurrentSessionId();

      expect(sessionId).toBeNull();
    });

    it('returns sessionId if session exists', () => {
      const session = getOrCreateSession();
      const sessionId = getCurrentSessionId();

      expect(sessionId).toBe(session.sessionId);
    });

    it('handles corrupted data gracefully', () => {
      localStorageMock.setItem('mars-rover-session-id', 'invalid');

      const sessionId = getCurrentSessionId();

      expect(sessionId).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('removes session from localStorage', () => {
      getOrCreateSession();
      expect(getCurrentSessionId()).not.toBeNull();

      clearSession();

      expect(getCurrentSessionId()).toBeNull();
    });

    it('allows creating new session after clearing', () => {
      const firstSession = getOrCreateSession();
      clearSession();
      const secondSession = getOrCreateSession();

      expect(secondSession.sessionId).not.toBe(firstSession.sessionId);
    });
  });

  describe('isStorageAvailable', () => {
    it('returns true when localStorage is available', () => {
      expect(isStorageAvailable()).toBe(true);
    });
  });

  describe('getShortSessionId', () => {
    it('returns first 8 characters of session ID', () => {
      const fullId = 'abc123def456ghi789jkl';
      const shortId = getShortSessionId(fullId);

      expect(shortId).toBe('abc123de');
      expect(shortId).toHaveLength(8);
    });

    it('handles short IDs gracefully', () => {
      const shortId = getShortSessionId('abc');

      expect(shortId).toBe('abc');
    });
  });

  describe('Session ID uniqueness', () => {
    it('generates unique session IDs', () => {
      clearSession();
      const session1 = getOrCreateSession();

      clearSession();
      const session2 = getOrCreateSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('Session ID collision resistance', () => {
    it('uses nanoid with sufficient entropy', () => {
      // Generate multiple sessions and ensure no duplicates
      const sessionIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        clearSession();
        const session = getOrCreateSession();
        sessionIds.add(session.sessionId);
      }

      // All IDs should be unique
      expect(sessionIds.size).toBe(100);
    });
  });
});
