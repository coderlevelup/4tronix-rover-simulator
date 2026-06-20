/**
 * React Hook: useLearnerID
 *
 * Simplified hook for accessing learner ID in React components.
 * Automatically initializes on mount and persists in localStorage.
 */

import { useState, useEffect } from 'react';
import { getLearnerID, hasLearnerID } from '@/lib/getLearnerID';
import { initializeLearner, LearnerRecord } from '@/lib/initializeLearner';

export function useLearnerID() {
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [learnerData, setLearnerData] = useState<LearnerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeOnMount();
  }, []);

  async function initializeOnMount() {
    try {
      setLoading(true);

      // Get or generate learner ID
      const id = getLearnerID();
      setLearnerId(id);

      // Initialize learner in Firestore
      const record = await initializeLearner();
      setLearnerData(record);

      console.log('✅ Learner initialized:', id);
    } catch (err) {
      console.error('❌ Failed to initialize learner:', err);
      setError('Failed to initialize learner session');
    } finally {
      setLoading(false);
    }
  }

  return {
    learnerId,
    learnerData,
    loading,
    error,
    hasLearnerID: hasLearnerID(),
  };
}
