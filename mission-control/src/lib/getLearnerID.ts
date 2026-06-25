/**
 * Reusable Utility: getLearnerID()
 *
 * Automatically retrieves or generates a unique learner ID.
 * - Generates random unique ID using nanoid
 * - Stores in localStorage for persistence
 * - Reuses existing ID if found in storage
 * - Generates new ID if cache/localStorage is cleared
 *
 * Usage:
 *   const learnerId = getLearnerID();
 */

import { nanoid } from 'nanoid';

const LEARNER_ID_KEY = 'mars-rover-learner-id';

/**
 * Get or create a unique learner ID
 *
 * @returns {string} The learner ID (either existing or newly generated)
 */
export function getLearnerID(): string {
  // Check if localStorage is available
  if (typeof window === 'undefined') {
    throw new Error('getLearnerID can only be called in browser context');
  }

  try {
    // Try to retrieve existing ID from localStorage
    const existingId = localStorage.getItem(LEARNER_ID_KEY);

    if (existingId && existingId.length > 0) {
      console.log('📋 Reusing existing learner ID:', existingId);
      return existingId;
    }

    // Generate new unique ID
    const newId = nanoid(21); // 21 chars = ~149 bits of entropy (collision-resistant)

    // Store in localStorage
    localStorage.setItem(LEARNER_ID_KEY, newId);

    console.log('✨ Generated new learner ID:', newId);
    return newId;
  } catch (error) {
    console.error('❌ Failed to access localStorage:', error);
    // Fallback: generate temporary ID (won't persist)
    console.warn('⚠️ Using temporary learner ID (will not persist)');
    return nanoid(21);
  }
}

/**
 * Clear the stored learner ID (useful for testing or reset)
 */
export function clearLearnerID(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(LEARNER_ID_KEY);
    console.log('🗑️ Learner ID cleared');
  } catch (error) {
    console.error('❌ Failed to clear learner ID:', error);
  }
}

/**
 * Check if a learner ID exists in storage
 *
 * @returns {boolean} True if ID exists, false otherwise
 */
export function hasLearnerID(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const id = localStorage.getItem(LEARNER_ID_KEY);
    return id !== null && id.length > 0;
  } catch {
    return false;
  }
}
