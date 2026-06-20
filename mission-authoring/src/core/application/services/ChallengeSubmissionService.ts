/**
 * Challenge Submission Service
 *
 * Orchestrates the complete challenge submission workflow:
 * 1. Validate code execution result
 * 2. Award XP if passed
 * 3. Check for level up
 * 4. Evaluate and award badges
 * 5. Update learner progress
 *
 * This is the main entry point for challenge submissions.
 */

import { Challenge, calculateXPReward } from '@/core/domain/entities/Challenge';
import { ILearnerRepository } from '@/core/domain/repositories/ILearnerRepository';
import { IChallengeRepository } from '@/core/domain/repositories/IChallengeRepository';
import {
  ValidationResult,
  validateChallengeOutput,
  SimulatorOutput,
  getValidationExplanation,
} from '@/infrastructure/validation/ValidationEngine';
import { ChallengeService } from './ChallengeService';
import { BadgeService } from './BadgeService';

export interface SubmitChallengeRequest {
  learnerId: string;
  challengeId: string;
  simulatorOutput: SimulatorOutput;
  hintsUsed: number;
}

export interface SubmitChallengeResponse {
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

export class ChallengeSubmissionService {
  private challengeService: ChallengeService;
  private badgeService: BadgeService;

  constructor(
    private readonly learnerRepository: ILearnerRepository,
    private readonly challengeRepository: IChallengeRepository
  ) {
    this.challengeService = new ChallengeService(challengeRepository, learnerRepository);
    this.badgeService = new BadgeService(learnerRepository);
  }

  /**
   * Main entry point: Submit a challenge attempt
   * Returns comprehensive result with validation, XP, level, and badges
   */
  async submitChallenge(request: SubmitChallengeRequest): Promise<SubmitChallengeResponse> {
    try {
      const { learnerId, challengeId, simulatorOutput, hintsUsed } = request;

      console.log(`📝 Challenge submission: ${learnerId} → ${challengeId}`);

      // Step 1: Get challenge definition
      const challenge = await this.challengeService.getChallenge(challengeId);
      if (!challenge) {
        return this.failResponse('Challenge not found');
      }

      // Step 2: Get learner
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) {
        return this.failResponse('Learner not found');
      }

      // Step 3: Validate output
      const validationResult = validateChallengeOutput(
        simulatorOutput,
        challenge.expectedOutput
      );

      console.log(`🔍 Validation result: passed=${validationResult.passed}, score=${validationResult.score}`);

      // Step 4: Record attempt
      await this.challengeService.recordSubmission(
        learnerId,
        challengeId,
        hintsUsed,
        validationResult.passed
      );

      // If failed, return early
      if (!validationResult.passed) {
        return {
          success: true,
          passed: false,
          score: validationResult.score,
          xpAwarded: 0,
          leveledUp: false,
          badgesAwarded: [],
          explanation: getValidationExplanation(validationResult),
        };
      }

      // Step 5: Award XP (reduced if hints were used)
      const baseXP = challenge.xpReward;
      const actualXP = calculateXPReward(baseXP, hintsUsed);

      const xpResult = await this.learnerRepository.addXP(learnerId, actualXP);

      console.log(
        `⭐ XP awarded: ${actualXP} (base: ${baseXP}, hints penalty: ${baseXP - actualXP})`
      );

      // Step 6: Mark challenge as completed
      await this.learnerRepository.completeChallenge(learnerId, challengeId, actualXP);

      // Step 7: Check for badges
      const badgeResult = await this.badgeService.evaluateEarnedBadges(learnerId);

      if (badgeResult.badgesAwarded.length > 0) {
        console.log(`🏆 Badges awarded:`, badgeResult.badgeDetails.map((b) => b.name).join(', '));
      }

      return {
        success: true,
        passed: true,
        score: validationResult.score,
        xpAwarded: actualXP,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.leveledUp ? xpResult.level : undefined,
        badgesAwarded: badgeResult.badgesAwarded,
        explanation: `🎉 Challenge completed! +${actualXP} XP${
          xpResult.leveledUp ? ` · Leveled up to ${xpResult.level}!` : ''
        }`,
      };
    } catch (error) {
      console.error('❌ Challenge submission failed:', error);
      return this.failResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get detailed feedback for a challenge attempt
   * Includes validation details, hints about what went wrong
   */
  async getFeedback(
    learnerId: string,
    challengeId: string,
    simulatorOutput: SimulatorOutput
  ): Promise<{
    passed: boolean;
    score: number;
    explanation: string;
    details: string[];
    hint?: string;
  }> {
    try {
      const challenge = await this.challengeService.getChallenge(challengeId);
      if (!challenge) {
        return {
          passed: false,
          score: 0,
          explanation: 'Challenge not found',
          details: [],
        };
      }

      const result = validateChallengeOutput(simulatorOutput, challenge.expectedOutput);

      return {
        passed: result.passed,
        score: result.score,
        explanation: getValidationExplanation(result),
        details: result.details.errors,
        hint: this.getSuggestionForFailure(result, challenge),
      };
    } catch (error) {
      console.error('❌ Failed to get feedback:', error);
      return {
        passed: false,
        score: 0,
        explanation: 'Failed to evaluate challenge',
        details: [],
      };
    }
  }

  /**
   * Get next challenge suggestion for learner
   */
  async getNextChallenge(learnerId: string): Promise<Challenge | null> {
    return this.challengeService.getNextChallenge(learnerId);
  }

  /**
   * Get all available challenges for learner
   */
  async getAvailableChallenges(learnerId: string): Promise<Challenge[]> {
    return this.challengeService.getAvailableChallengesForLearner(learnerId);
  }

  /**
   * Get learner's challenge progress
   */
  async getLearnerProgress(learnerId: string) {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) return null;

      const allChallenges = await this.challengeService.getAllChallenges();
      const progress = await this.challengeRepository.getProgressForLearner(learnerId);

      return {
        learner,
        allChallenges,
        progress,
        completedCount: learner.challenges_completed.length,
        totalCount: allChallenges.length,
        completionPercentage:
          allChallenges.length > 0
            ? Math.round((learner.challenges_completed.length / allChallenges.length) * 100)
            : 0,
      };
    } catch (error) {
      console.error('❌ Failed to get learner progress:', error);
      return null;
    }
  }

  /**
   * ========== PRIVATE HELPERS ==========
   */

  private failResponse(error: string): SubmitChallengeResponse {
    return {
      success: false,
      passed: false,
      score: 0,
      xpAwarded: 0,
      leveledUp: false,
      badgesAwarded: [],
      explanation: `❌ ${error}`,
      error,
    };
  }

  /**
   * Provide helpful suggestion based on failure type
   */
  private getSuggestionForFailure(result: ValidationResult, challenge: Challenge): string | undefined {
    if (result.passed) {
      return undefined;
    }

    const expectedShapes = challenge.expectedOutput.shapes;
    const drawnShapes = result.details.totalShapesMatched;

    if (drawnShapes === 0) {
      return `💡 Hint: You haven't drawn any shapes yet. Check your code syntax.`;
    }

    if (drawnShapes < expectedShapes.length) {
      return `💡 Hint: You've drawn ${drawnShapes} shapes but expected ${expectedShapes.length}. Check your loops.`;
    }

    if (result.details.errors.length > 0) {
      return `💡 ${result.details.errors[0]}`;
    }

    return `💡 Your shapes don't match the expected output. Try adjusting the coordinates and dimensions.`;
  }
}