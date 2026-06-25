/**
 * Anonymous Authentication Service
 *
 * Provides session-based identification for learners without requiring
 * email/password authentication.
 *
 * Uses nanoid for cryptographically strong unique identifiers and
 * localStorage for session persistence across page reloads.
 */

import { nanoid } from 'nanoid';

const SESSION_STORAGE_KEY = 'mars-rover-session-id';
const LEARNER_STORAGE_KEY = 'mars-rover-learner-profile';

export interface LearnerSession {
  sessionId: string;
  createdAt: string;
  fingerprint?: string;
}

/**
 * Gets or creates an anonymous session for the current browser
 * Safe to call on every page load
 */
export function getOrCreateSession(): LearnerSession {
  if (typeof window === 'undefined') {
    throw new Error('getOrCreateSession can only be called in browser context');
  }

  // Try to retrieve existing session
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);

  if (stored) {
    try {
      const session = JSON.parse(stored) as LearnerSession;

      // Validate session structure
      if (session.sessionId && session.createdAt) {
        console.log('📋 Retrieved existing session:', session.sessionId);
        return session;
      }
    } catch {
      console.warn('⚠️ Failed to parse stored session, creating new one');
    }
  }

  // Create new session
  const newSession: LearnerSession = {
    sessionId: nanoid(21), // 21 chars = ~149 bits of entropy (collision-resistant)
    createdAt: new Date().toISOString(),
    fingerprint: generateBrowserFingerprint(),
  };

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  console.log('✨ Created new session:', newSession.sessionId);

  return newSession;
}

/**
 * Gets the current session ID or null if not initialized
 */
export function getCurrentSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored) as LearnerSession;
    return session.sessionId || null;
  } catch {
    return null;
  }
}

/**
 * Clears the current session (useful for testing or explicit logout)
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(LEARNER_STORAGE_KEY);
  console.log('🗑️ Session cleared');
}

/**
 * Generates a simple browser fingerprint for device identification
 * Not meant to be robust against spoofing - just for basic device tracking
 */
function generateBrowserFingerprint(): string {
  if (typeof window === 'undefined') return '';

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ];

  const raw = components.join('|');

  // Simple hash function (not cryptographic, just for fingerprinting)
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Checks if the browser supports the required storage APIs
 */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets a display-friendly short version of the session ID
 */
export function getShortSessionId(sessionId: string): string {
  return sessionId.substring(0, 8);
}
