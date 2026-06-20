/**
 * Mission Submission Hook
 *
 * Handles mission submission for anonymous learners.
 * Submits missions to the API endpoint which handles persistence via Firestore Admin SDK.
 *
 * This ensures:
 * - Operators can see missions in their queue
 * - Learners can track their own mission history via learnerId
 * - Real-time updates work for learner feedback
 */

import { useState } from 'react';
import { validateMission } from '@/infrastructure/validation/schemas';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

interface MissionSubmitParams {
  code: string;
  yardId: string;
  learnerId: string;
  sessionId: string;
  challengeId?: string;
  missionName?: string;
}

interface MissionSubmitResult {
  success: boolean;
  missionId?: string;
  error?: string;
}

export function useMissionSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit a mission
   *
   * @param params - Mission submission parameters
   * @returns Result with mission ID or error
   */
  const submitMission = async (
    params: MissionSubmitParams
  ): Promise<MissionSubmitResult> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const validation = validateMission({
        code: params.code,
        yardId: params.yardId,
        learnerId: params.learnerId,
        sessionId: params.sessionId,
        challengeId: params.challengeId,
        name: params.missionName,
      });

      if (!validation.success) {
        throw new Error(validation.errors?.[0] || 'Failed to submit mission');
      }

      // validation.data is defined when validation.success is true
      const payload = validation.data!;

      const repository = new FirestoreMissionRepository(getFirestoreClient());
      const mission = await repository.create({
        ...payload,
        status: 'queued',
      });

      setIsSubmitting(false);
      return {
        success: true,
        missionId: mission.id,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setIsSubmitting(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    submitMission,
    isSubmitting,
    error,
  };
}
