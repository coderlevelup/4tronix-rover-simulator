/**
 * Extended Learner Repository Interface
 *
 * Defines operations for managing anonymous learner data including gamification.
 * Follows repository pattern for clean architecture separation.
 *
 * Changes from original:
 * - Added addXP() and updateLevel() for gamification
 * - Added badge management (addBadge, getBadges)
 * - Added challenge management (unlockChallenge, completedChallenge)
 * - Added leaderboard queries
 */

import { Learner } from '../entities/Learner';

export interface ILearnerRepository {
  /**
   * Create a new learner profile
   */
  create(learner: Learner): Promise<void>;

  /**
   * Find learner by session ID
   */
  findBySessionId(sessionId: string): Promise<Learner | null>;

  /**
   * Update learner profile
   */
  update(sessionId: string, updates: Partial<Learner>): Promise<void>;

  /**
   * Increment mission counters (original methods)
   */
  incrementMissionCount(sessionId: string): Promise<void>;

  /**
   * Increment completed mission counter
   */
  incrementCompletedMissions(sessionId: string): Promise<void>;

  /**
   * Update last active timestamp
   */
  updateLastActive(sessionId: string): Promise<void>;

  /**
   * Get learner statistics (for analytics)
   */
  getStatistics(sessionId: string): Promise<{
    totalMissions: number;
    completedMissions: number;
    successRate: number;
  }>;

  /**
   * ========== GAMIFICATION METHODS ==========
   */

  /**
   * Add XP to a learner and automatically update level
   * @param sessionId - Learner session ID
   * @param amount - XP amount to add
   * @returns Updated learner data with new XP and level
   */
  addXP(sessionId: string, amount: number): Promise<{ xp: number; level: number; leveledUp: boolean }>;

  /**
   * Manually set learner level (usually called after XP update)
   * @param sessionId - Learner session ID
   * @param level - New level (1-5)
   */
  updateLevel(sessionId: string, level: number): Promise<void>;

  /**
   * Add a badge to learner's earned badges
   * @param sessionId - Learner session ID
   * @param badgeId - Badge ID to award
   * @returns true if badge was newly added, false if already had it
   */
  addBadge(sessionId: string, badgeId: string): Promise<boolean>;

  /**
   * Get all badges earned by learner
   * @param sessionId - Learner session ID
   * @returns Array of badge IDs
   */
  getBadges(sessionId: string): Promise<string[]>;

  /**
   * Mark a challenge as unlocked for this learner
   * @param sessionId - Learner session ID
   * @param challengeId - Challenge ID to unlock
   */
  unlockChallenge(sessionId: string, challengeId: string): Promise<void>;

  /**
   * Mark a challenge as completed for this learner
   * Also records the attempt and updates XP/badges
   * @param sessionId - Learner session ID
   * @param challengeId - Challenge ID that was completed
   * @param xpEarned - XP to award
   */
  completeChallenge(sessionId: string, challengeId: string, xpEarned: number): Promise<void>;

  /**
   * Track hint usage for a challenge
   * @param sessionId - Learner session ID
   * @param challengeId - Challenge ID
   * @param count - Number of hints used (1-3)
   */
  recordHintUsage(sessionId: string, challengeId: string, count: number): Promise<void>;

  /**
   * Get leaderboard (top learners by XP)
   * @param limit - Number of top learners to return (default 100)
   * @param offset - For pagination (default 0)
   * @returns Array of learners sorted by XP descending
   */
  getLeaderboard(limit?: number, offset?: number): Promise<{
    rank: number;
    learnerId: string;
    displayName: string;
    level: number;
    xp: number;
  }[]>;

  /**
   * Get a specific learner's rank on the leaderboard
   * @param sessionId - Learner session ID
   * @returns { rank, xp, level } or null if not on leaderboard yet
   */
  getLeaderboardRank(sessionId: string): Promise<{ rank: number; xp: number; level: number } | null>;

  /**
   * Get total number of learners with XP (for leaderboard context)
   */
  getTotalLearnersWithXP(): Promise<number>;

  /**
   * Admin/analytics function: Get active learners count
   */
  getActiveLearnerCount(days?: number): Promise<number>;
}