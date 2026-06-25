/**
 * Set Custom Claims Utility
 *
 * Server-side utility for setting custom claims on Firebase users.
 * This should be called when a user's role is updated in the database.
 */

import { getFirebaseAdminAuth } from '@/infrastructure/persistence/firebase-admin';

export interface CustomClaims {
  role?: 'learner' | 'operator' | 'admin';
  yardIds?: string[];
  [key: string]: unknown;
}

/**
 * Set custom claims for a user
 * @param uid - The Firebase user ID
 * @param claims - The custom claims to set
 * @throws Error if the operation fails
 */
export async function setUserCustomClaims(
  uid: string,
  claims: CustomClaims
): Promise<void> {
  try {
    const auth = getFirebaseAdminAuth();
    await auth.setCustomUserClaims(uid, claims);
    console.log(`✅ Custom claims set for user ${uid}:`, claims);
  } catch (error) {
    console.error(`❌ Failed to set custom claims for user ${uid}:`, error);
    throw error;
  }
}

/**
 * Set the operator role for a user
 * @param uid - The Firebase user ID
 * @param role - The role to assign ('learner', 'operator', 'admin')
 * @throws Error if the operation fails
 */
export async function setUserRole(
  uid: string,
  role: 'learner' | 'operator' | 'admin'
): Promise<void> {
  return setUserCustomClaims(uid, { role });
}

/**
 * Set yard IDs for an operator user
 * @param uid - The Firebase user ID
 * @param yardIds - Array of yard IDs the user can access
 * @throws Error if the operation fails
 */
export async function setUserYards(uid: string, yardIds: string[]): Promise<void> {
  return setUserCustomClaims(uid, { yardIds });
}

/**
 * Clear all custom claims for a user
 * @param uid - The Firebase user ID
 * @throws Error if the operation fails
 */
export async function clearUserCustomClaims(uid: string): Promise<void> {
  try {
    const auth = getFirebaseAdminAuth();
    await auth.setCustomUserClaims(uid, null);
    console.log(`✅ Custom claims cleared for user ${uid}`);
  } catch (error) {
    console.error(`❌ Failed to clear custom claims for user ${uid}:`, error);
    throw error;
  }
}
