/**
 * Learner Initialization Service
 *
 * Automatically retrieves or creates learner records on app startup.
 * Handles Firestore document creation and updates.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreClient } from './firebase';
import { getLearnerID } from './getLearnerID';

type FirestoreTimestampLike = {
  toDate?: () => Date;
};

export interface LearnerRecord {
  learnerId: string;
  createdAt: string | FirestoreTimestampLike;
  missionsCompleted: number;
  progress: number;
}

/**
 * Initialize learner on app startup
 *
 * - Retrieves or generates learner ID
 * - Fetches existing record from Firestore
 * - Creates new record if doesn't exist
 *
 * @returns {Promise<LearnerRecord>} The learner record
 */
export async function initializeLearner(): Promise<LearnerRecord> {
  try {
    // Get or generate learner ID
    const learnerId = getLearnerID();

    // Get Firestore instance
    const db = getFirestoreClient();

    // Reference to learner document
    const learnerRef = doc(db, 'learners', learnerId);

    // Try to fetch existing learner
    const learnerSnap = await getDoc(learnerRef);

    if (learnerSnap.exists()) {
      // Existing learner found
      const data = learnerSnap.data() as LearnerRecord;
      console.log('👋 Welcome back, learner:', learnerId);

      // Update last active timestamp
      await setDoc(
        learnerRef,
        {
          lastActiveAt: serverTimestamp(),
        },
        { merge: true }
      );

      return {
        learnerId: data.learnerId,
        createdAt: toIsoString(data.createdAt),
        missionsCompleted: data.missionsCompleted || 0,
        progress: data.progress || 0,
      };
    } else {
      // New learner - create document
      const newLearner: LearnerRecord = {
        learnerId,
        createdAt: serverTimestamp() as FirestoreTimestampLike,
        missionsCompleted: 0,
        progress: 0,
      };

      await setDoc(learnerRef, {
        ...newLearner,
        lastActiveAt: serverTimestamp(),
      });

      console.log('✨ Created new learner:', learnerId);

      return {
        ...newLearner,
        createdAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.warn('⚠️ Firestore learner initialization failed, using local record fallback:', error);

    const learnerId = getLearnerID();
    return {
      learnerId,
      createdAt: new Date().toISOString(),
      missionsCompleted: 0,
      progress: 0,
    };
  }
}

function toIsoString(value: string | FirestoreTimestampLike): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toDate?.().toISOString() || new Date().toISOString();
}

/**
 * Update learner's missions completed count
 *
 * @param {string} learnerId - The learner ID
 */
export async function incrementMissionsCompleted(learnerId: string): Promise<void> {
  try {
    const db = getFirestoreClient();
    const learnerRef = doc(db, 'learners', learnerId);

    const learnerSnap = await getDoc(learnerRef);

    if (learnerSnap.exists()) {
      const current = learnerSnap.data().missionsCompleted || 0;

      await setDoc(
        learnerRef,
        {
          missionsCompleted: current + 1,
          lastActiveAt: serverTimestamp(),
        },
        { merge: true }
      );

      console.log('✅ Missions completed updated:', current + 1);
    }
  } catch (error) {
    console.error('❌ Failed to update missions completed:', error);
  }
}

/**
 * Update learner's progress
 *
 * @param {string} learnerId - The learner ID
 * @param {number} progress - Progress value (0-100)
 */
export async function updateProgress(learnerId: string, progress: number): Promise<void> {
  try {
    const db = getFirestoreClient();
    const learnerRef = doc(db, 'learners', learnerId);

    await setDoc(
      learnerRef,
      {
        progress: Math.max(0, Math.min(100, progress)), // Clamp between 0-100
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('✅ Progress updated:', progress);
  } catch (error) {
    console.error('❌ Failed to update progress:', error);
  }
}
