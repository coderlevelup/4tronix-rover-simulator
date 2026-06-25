/**
 * @deprecated This service is deprecated. Use missionQueryService instead.
 *
 * Learner Mission Service
 *
 * ⚠️ DEPRECATED: This service manages mission data in a learner-specific subcollection
 * pattern. Missions are now stored directly in the main missions collection with
 * a learnerId field. Use missionQueryService for real-time queries instead.
 *
 * Old path: learners/{learnerId}/missions/{missionId}
 * New path: missions/{missionId} with learnerId field
 *
 * This service is kept for backward compatibility only and should not be used
 * in new code. All functionality has been migrated to query the main missions
 * collection by learnerId.
 *
 * Historical Mission Status Flow:
 * 1. "submitted" - Learner submits mission
 * 2. "in-progress" - Operator starts execution
 * 3. "completed" - Operator finishes execution (includes video link)
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';

/**
 * Learner Mission Data Structure
 */
export interface LearnerMission {
  missionId: string;
  missionName?: string;
  status: 'submitted' | 'in-progress' | 'completed';
  submittedAt: string;
  completedAt?: string;
  youtubeVideoLink?: string;
  executionNotes?: string;
  code?: string;
  yardId?: string;
}

/**
 * @deprecated Use the main missions collection with learnerId field instead.
 *
 * Save or update a mission for a learner
 *
 * @param learnerId - Unique learner identifier from localStorage
 * @param mission - Mission data to save
 */
export async function saveLearnerMission(
  learnerId: string,
  mission: LearnerMission
): Promise<void> {
  try {
    const db = getFirestoreClient();
    const missionRef = doc(
      db,
      'learners',
      learnerId,
      'missions',
      mission.missionId
    );

    await setDoc(
      missionRef,
      {
        ...mission,
        submittedAt: mission.submittedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true } // Allows updates without overwriting existing data
    );

    console.log('✅ Learner mission saved:', mission.missionId);
  } catch (error) {
    console.error('❌ Failed to save learner mission:', error);
    throw new Error('Failed to save mission');
  }
}

/**
 * @deprecated Use missionQueryService instead.
 *
 * Get a single mission for a learner
 *
 * @param learnerId - Unique learner identifier
 * @param missionId - Mission ID
 * @returns Mission data or null if not found
 */
export async function getLearnerMission(
  learnerId: string,
  missionId: string
): Promise<LearnerMission | null> {
  try {
    const db = getFirestoreClient();
    const missionRef = doc(
      db,
      'learners',
      learnerId,
      'missions',
      missionId
    );

    const missionSnap = await getDoc(missionRef);

    if (!missionSnap.exists()) {
      return null;
    }

    return convertTimestamps(missionSnap.data() as LearnerMission);
  } catch (error) {
    console.error('❌ Failed to get learner mission:', error);
    return null;
  }
}

/**
 * @deprecated Use missionQueryService.getMissionsByLearnerId instead.
 *
 * Get all missions for a learner (for Mission History page)
 *
 * @param learnerId - Unique learner identifier
 * @returns Array of missions sorted by submission time (newest first)
 */
export async function getLearnerMissions(
  learnerId: string
): Promise<LearnerMission[]> {
  try {
    const db = getFirestoreClient();
    const missionsRef = collection(db, 'learners', learnerId, 'missions');
    const q = query(missionsRef, orderBy('submittedAt', 'desc'));

    const querySnapshot = await getDocs(q);

    const missions: LearnerMission[] = [];
    querySnapshot.forEach((doc) => {
      missions.push(convertTimestamps(doc.data() as LearnerMission));
    });

    return missions;
  } catch (error) {
    console.error('❌ Failed to get learner missions:', error);
    return [];
  }
}

/**
 * @deprecated Use missionQueryService.subscribeMissionsByLearnerId instead.
 *
 * Subscribe to real-time mission updates for a learner
 *
 * This enables instant UI updates when an operator completes execution
 * and adds video links or execution notes.
 *
 * @param learnerId - Unique learner identifier
 * @param callback - Function called when missions update
 * @returns Unsubscribe function to stop listening
 */
export function subscribeLearnerMissions(
  learnerId: string,
  callback: (missions: LearnerMission[]) => void
): Unsubscribe {
  const db = getFirestoreClient();
  const missionsRef = collection(db, 'learners', learnerId, 'missions');
  const q = query(missionsRef, orderBy('submittedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const missions: LearnerMission[] = [];
      snapshot.forEach((doc) => {
        missions.push(convertTimestamps(doc.data() as LearnerMission));
      });
      callback(missions);
    },
    (error) => {
      console.error('❌ Mission subscription error:', error);
      callback([]);
    }
  );
}

/**
 * @deprecated Update the main missions collection directly instead.
 *
 * Operators should now update missions/{missionId} directly with youtubeUrl and status.
 *
 * @param learnerId - Unique learner identifier
 * @param missionId - Mission ID
 * @param updates - Partial mission data to update
 */
export async function updateLearnerMission(
  learnerId: string,
  missionId: string,
  updates: Partial<LearnerMission>
): Promise<void> {
  try {
    const db = getFirestoreClient();
    const missionRef = doc(
      db,
      'learners',
      learnerId,
      'missions',
      missionId
    );

    await updateDoc(missionRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    console.log('✅ Learner mission updated:', missionId);
  } catch (error) {
    console.error('❌ Failed to update learner mission:', error);
    throw new Error('Failed to update mission');
  }
}

/**
 * Convert Firestore Timestamps to ISO strings
 *
 * Firestore sometimes returns Timestamp objects instead of strings.
 * This helper ensures consistent date formatting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore returns Timestamp|string for date fields; this bridges both shapes
function convertTimestamps(data: any): LearnerMission {
  const mission = { ...data };

  if (mission.submittedAt instanceof Timestamp) {
    mission.submittedAt = mission.submittedAt.toDate().toISOString();
  }

  if (mission.completedAt instanceof Timestamp) {
    mission.completedAt = mission.completedAt.toDate().toISOString();
  }

  return mission;
}
