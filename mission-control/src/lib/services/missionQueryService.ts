/**
 * Mission Query Service
 *
 * Provides real-time mission queries by learner ID.
 * Replaces the learner-specific subcollection pattern.
 *
 * Enables:
 * - Real-time mission status updates from operators
 * - Learner-specific mission history queries
 * - Efficient filtering by learnerId on main missions collection
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Mission } from '@/core/domain/entities/Mission';

/**
 * Get all missions for a learner with real-time updates
 *
 * This enables instant UI updates when an operator completes execution
 * and adds video links or execution notes.
 *
 * @param learnerId - Unique learner identifier
 * @param callback - Function called when missions update
 * @returns Unsubscribe function to stop listening
 */
export function subscribeMissionsByLearnerId(
  learnerId: string,
  callback: (missions: Mission[]) => void
): Unsubscribe {
  const db = getFirestoreClient();
  const missionsRef = collection(db, 'missions');
  const q = query(
    missionsRef,
    where('learnerId', '==', learnerId),
    orderBy('submittedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const missions: Mission[] = [];
      snapshot.forEach((doc) => {
        missions.push(convertTimestamps(doc.data() as Mission, doc.id));
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
 * Get all missions for a learner email with real-time updates.
 *
 * Used by the history page so a learner can see every mission they have ever
 * submitted under the same email, across devices/browsers.
 *
 * @param learnerEmail - Email the learner identified with
 * @param callback - Function called when missions update
 * @returns Unsubscribe function to stop listening
 */
export function subscribeMissionsByLearnerEmail(
  learnerEmail: string,
  callback: (missions: Mission[]) => void
): Unsubscribe {
  const db = getFirestoreClient();
  const missionsRef = collection(db, 'missions');
  const q = query(
    missionsRef,
    where('learnerEmail', '==', learnerEmail),
    orderBy('submittedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const missions: Mission[] = [];
      snapshot.forEach((doc) => {
        missions.push(convertTimestamps(doc.data() as Mission, doc.id));
      });
      callback(missions);
    },
    (error) => {
      console.error('❌ Mission (by email) subscription error:', error);
      callback([]);
    }
  );
}

/**
 * Get all missions for a learner (one-time fetch)
 *
 * @param learnerId - Unique learner identifier
 * @returns Array of missions sorted by submission time (newest first)
 */
export async function getMissionsByLearnerId(
  learnerId: string
): Promise<Mission[]> {
  try {
    const db = getFirestoreClient();
    const missionsRef = collection(db, 'missions');
    const q = query(
      missionsRef,
      where('learnerId', '==', learnerId),
      orderBy('submittedAt', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const missions: Mission[] = [];
    querySnapshot.forEach((doc) => {
      missions.push(convertTimestamps(doc.data() as Mission, doc.id));
    });

    return missions;
  } catch (error) {
    console.error('❌ Failed to get missions by learnerId:', error);
    return [];
  }
}

/**
 * Convert Firestore Timestamps to ISO strings
 *
 * Firestore sometimes returns Timestamp objects instead of strings.
 * This helper ensures consistent date formatting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore returns Timestamp|string for date fields; this bridges both shapes
function convertTimestamps(data: any, docId: string): Mission {
  const mission = { ...data, id: docId };

  if (mission.submittedAt instanceof Timestamp) {
    mission.submittedAt = mission.submittedAt.toDate().toISOString();
  }

  if (mission.startedAt instanceof Timestamp) {
    mission.startedAt = mission.startedAt.toDate().toISOString();
  }

  if (mission.completedAt instanceof Timestamp) {
    mission.completedAt = mission.completedAt.toDate().toISOString();
  }

  return mission as unknown as Mission;
}
