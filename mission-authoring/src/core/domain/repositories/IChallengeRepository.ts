/**
 * Challenge Repository Interface
 *
 * Defines operations for managing challenges.
 * Challenges are instructor-created, immutable exercises.
 * This repository handles persistence and queries.
 *
 * Note: Challenges are typically populated from src/data/challenges.ts
 * but can also be stored in Firestore for dynamic management.
 */

import { Challenge, ChallengeProgress } from '../entities/Challenge';

export interface IChallengeRepository {
  /**
   * Get a single challenge by ID
   * @param id - Challenge ID
   * @returns Challenge or null if not found
   */
  getById(id: string): Promise<Challenge | null>;

  /**
   * Get all challenges
   * @returns Array of all challenges
   */
  getAll(): Promise<Challenge[]>;

  /**
   * Get challenges by difficulty level
   * @param difficulty - 'beginner' | 'intermediate' | 'advanced'
   * @returns Array of challenges with matching difficulty
   */
  getByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<Challenge[]>;

  /**
   * Get challenges by category
   * @param category - Category name (e.g., 'shapes', 'patterns')
   * @returns Array of challenges with matching category
   */
  getByCategory(category: string): Promise<Challenge[]>;

  /**
   * Get challenges available to a learner (respecting level & prerequisites)
   * @param learnerId - Learner ID
   * @returns Array of challenges learner can attempt
   */
  getAvailableChallenges(learnerId: string): Promise<Challenge[]>;

  /**
   * ========== CHALLENGE PROGRESS TRACKING ==========
   */

  /**
   * Get a learner's progress on a specific challenge
   * @param learnerId - Learner ID
   * @param challengeId - Challenge ID
   * @returns ChallengeProgress or null if not started
   */
  getProgress(learnerId: string, challengeId: string): Promise<ChallengeProgress | null>;

  /**
   * Get all progress records for a learner
   * @param learnerId - Learner ID
   * @returns Array of ChallengeProgress records
   */
  getProgressForLearner(learnerId: string): Promise<ChallengeProgress[]>;

  /**
   * Create or update a challenge progress record
   * @param progress - ChallengeProgress data
   */
  saveProgress(progress: ChallengeProgress): Promise<void>;

  /**
   * Mark a challenge as completed for a learner
   * @param learnerId - Learner ID
   * @param challengeId - Challenge ID
   * @param xpAwarded - XP to award
   * @param badgeAwarded - Whether a badge was awarded
   */
  markCompleted(
    learnerId: string,
    challengeId: string,
    xpAwarded: number,
    badgeAwarded: boolean
  ): Promise<void>;

  /**
   * Increment attempts for a challenge
   * @param learnerId - Learner ID
   * @param challengeId - Challenge ID
   */
  incrementAttempts(learnerId: string, challengeId: string): Promise<void>;

  /**
   * Update hint count for a challenge
   * @param learnerId - Learner ID
   * @param challengeId - Challenge ID
   * @param hintsRevealed - Number of hints revealed (1-3)
   */
  updateHintsRevealed(learnerId: string, challengeId: string, hintsRevealed: number): Promise<void>;

  /**
   * ========== ANALYTICS ==========
   */

  /**
   * Get challenge completion stats
   * @param challengeId - Challenge ID
   * @returns { completions, attempts, completionRate }
   */
  getCompletionStats(challengeId: string): Promise<{
    completions: number;
    attempts: number;
    completionRate: number;
  }>;

  /**
   * Get most completed challenges
   * @param limit - Number of challenges to return
   * @returns Array of challenges sorted by completion count
   */
  getMostCompleted(limit: number): Promise<Challenge[]>;
}