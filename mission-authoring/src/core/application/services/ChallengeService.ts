/**
 * Challenge Service
 *
 * Business logic layer for challenge management.
 * Orchestrates operations between repositories, validation, and learner management.
 *
 * Responsibilities:
 * - Get challenge details
 * - Check if learner can attempt challenge
 * - Unlock challenges
 * - Process challenge submissions
 * - Track progress
 */

import { Challenge, ChallengeProgress, calculateXPReward, canAttemptChallenge } from '@/core/domain/entities/Challenge';
import { Learner } from '@/core/domain/entities/Learner';
import { IChallengeRepository } from '@/core/domain/repositories/IChallengeRepository';
import { ILearnerRepository } from '@/core/domain/repositories/ILearnerRepository';

export interface ChallengeSubmissionResult {
  success: boolean;
  passed: boolean;
  xpAwarded: number;
  leveledUp: boolean;
  badgesAwarded: string[];
  error?: string;
  details?: {
    score: number;
    hintsUsed: number;
  };
}

export class ChallengeService {
  constructor(
    private readonly challengeRepository: IChallengeRepository,
    private readonly learnerRepository: ILearnerRepository
  ) {}

  /**
   * Get a single challenge
   */
  async getChallenge(challengeId: string): Promise<Challenge | null> {
    return this.challengeRepository.getById(challengeId);
  }

  /**
   * Get all challenges
   */
  async getAllChallenges(): Promise<Challenge[]> {
    return this.challengeRepository.getAll();
  }

  /**
   * Get challenges filtered by difficulty
   */
  async getChallengesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<Challenge[]> {
    return this.challengeRepository.getByDifficulty(difficulty);
  }

  /**
   * Get challenges available to a learner
   * Respects level requirements and prerequisites
   */
  async getAvailableChallengesForLearner(learnerId: string): Promise<Challenge[]> {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) {
        return [];
      }

      const allChallenges = await this.getAllChallenges();

      // Filter challenges learner can attempt
      return allChallenges.filter((challenge) => canAttemptChallenge(learner, challenge));
    } catch (error) {
      console.error('❌ Failed to get available challenges:', error);
      return [];
    }
  }

  /**
   * Check if learner can attempt a challenge
   */
  async canAttempt(learnerId: string, challengeId: string): Promise<boolean> {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      const challenge = await this.getChallenge(challengeId);

      if (!learner || !challenge) {
        return false;
      }

      return canAttemptChallenge(learner, challenge);
    } catch (error) {
      console.error('❌ Failed to check if can attempt:', error);
      return false;
    }
  }

  /**
   * Get learner's progress on a challenge
   */
  async getProgress(learnerId: string, challengeId: string): Promise<ChallengeProgress | null> {
    return this.challengeRepository.getProgress(learnerId, challengeId);
  }

  /**
   * Get all progress for a learner
   */
  async getProgressForLearner(learnerId: string): Promise<ChallengeProgress[]> {
    return this.challengeRepository.getProgressForLearner(learnerId);
  }

  /**
   * Unlock a challenge for a learner
   * (Usually called when they reach the required level)
   */
  async unlockChallenge(learnerId: string, challengeId: string): Promise<void> {
    try {
      // Check if already unlocked
      const progress = await this.getProgress(learnerId, challengeId);
      if (progress) {
        return;
      }

      // Create initial progress record
      const now = new Date().toISOString();
      const initialProgress: ChallengeProgress = {
        learnerId,
        challengeId,
        status: 'unlocked',
        attemptsCount: 0,
        hintsRevealed: 0,
        xpAwarded: 0,
        badgeAwarded: false,
        lastAttemptAt: now,
      };

      await this.challengeRepository.saveProgress(initialProgress);
      await this.learnerRepository.unlockChallenge(learnerId, challengeId);

      console.log(`✅ Challenge unlocked for ${learnerId}: ${challengeId}`);
    } catch (error) {
      console.error('❌ Failed to unlock challenge:', error);
      throw new Error('Failed to unlock challenge');
    }
  }

  /**
   * Process a challenge submission
   * Records attempt, tracks hints, evaluates if passed, awards XP/badges
   * Note: Validation happens in ValidationEngine (this just records it)
   */
  async recordSubmission(
    learnerId: string,
    challengeId: string,
    hintsUsed: number,
    passed: boolean
  ): Promise<void> {
    try {
      let progress = await this.getProgress(learnerId, challengeId);

      if (!progress) {
        // First attempt - create initial record
        const now = new Date().toISOString();
        progress = {
          learnerId,
          challengeId,
          status: passed ? 'completed' : 'in_progress',
          attemptsCount: 1,
          hintsRevealed: hintsUsed,
          xpAwarded: 0,
          badgeAwarded: false,
          lastAttemptAt: now,
        };
      } else {
        // Update existing record
        progress.attemptsCount += 1;
        progress.hintsRevealed = Math.max(progress.hintsRevealed, hintsUsed);
        if (passed) {
          progress.status = 'completed';
          progress.completedAt = new Date().toISOString();
        }
      }

      await this.challengeRepository.saveProgress(progress);

      console.log(
        `✅ Submission recorded for ${learnerId} on ${challengeId}: passed=${passed}, hints=${hintsUsed}`
      );
    } catch (error) {
      console.error('❌ Failed to record submission:', error);
      throw new Error('Failed to record challenge submission');
    }
  }

  /**
   * Get next recommended challenge for a learner
   */
  async getNextChallenge(learnerId: string): Promise<Challenge | null> {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) {
        return null;
      }

      const available = await this.getAvailableChallengesForLearner(learnerId);

      // Return first uncompleted challenge
      const nextChallenge = available.find((c) => !learner.challenges_completed.includes(c.id));

      return nextChallenge || null;
    } catch (error) {
      console.error('❌ Failed to get next challenge:', error);
      return null;
    }
  }

  /**
   * Get challenge statistics
   */
  async getStats(challengeId: string): Promise<{
    completions: number;
    attempts: number;
    completionRate: number;
  }> {
    return this.challengeRepository.getCompletionStats(challengeId);
  }

  /**
   * Get most completed challenges
   */
  async getMostCompleted(limit: number = 10): Promise<Challenge[]> {
    return this.challengeRepository.getMostCompleted(limit);
  }
}