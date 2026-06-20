/**
 * Challenge Submission Hook
 * Handles the complete flow of submitting and validating a challenge
 *
 * Usage:
 * const { submitChallenge, isSubmitting, error } = useChallengeSubmit();
 *
 * const result = await submitChallenge({
 *   learnerId: '...',
 *   challengeId: '...',
 *   simulatorOutput: {...},
 *   hintsUsed: 0
 * });
 */

'use client';

import { useState, useCallback } from 'react';

interface ChallengeSubmitParams {
  learnerId: string;
  challengeId: string;
  simulatorOutput: {
    success: boolean;
    shapes: Array<{
      shape: string;
      [key: string]: any;
    }>;
    consoleOutput?: string;
    errorMessage?: string;
  };
  hintsUsed: number;
}

interface ChallengeSubmitResult {
  success: boolean;
  passed: boolean;
  score: number;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel?: number;
  badgesAwarded: string[];
  explanation: string;
  error?: string;
}

export function useChallengeSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitChallenge = async (
    params: ChallengeSubmitParams
  ): Promise<ChallengeSubmitResult | null> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/challenges/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          learnerId: params.learnerId,
          challengeId: params.challengeId,
          simulatorOutput: params.simulatorOutput,
          hintsUsed: params.hintsUsed,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit challenge');
      }

      const result: ChallengeSubmitResult = await response.json();

      setIsSubmitting(false);

      if (!result.success) {
        setError(result.error || 'Unknown error');
        return null;
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setIsSubmitting(false);
      return null;
    }
  };

  return {
    submitChallenge,
    isSubmitting,
    error,
  };
}

/**
 * Hook for getting a hint for a challenge
 */
export function useGetChallengeHint() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHint = async (
    learnerId: string,
    challengeId: string,
    hintLevel: number
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/challenges/${challengeId}/hint`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            learnerId,
            hintLevel,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get hint');
      }

      const result = await response.json();
      setIsLoading(false);

      return result.hint;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get hint';
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  };

  return {
    getHint,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching leaderboard data
 */
export function useLeaderboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const fetchLeaderboard = useCallback(async (limit = 100, offset = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/leaderboard?limit=${limit}&offset=${offset}`);

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }

      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
      setIsLoading(false);

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  const fetchLearnerRank = useCallback(async (learnerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/leaderboard?learnerId=${learnerId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch rank');
      }

      const data = await response.json();
      setIsLoading(false);

      return data.learnerRank;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  return {
    fetchLeaderboard,
    fetchLearnerRank,
    leaderboard,
    isLoading,
    error,
  };
}