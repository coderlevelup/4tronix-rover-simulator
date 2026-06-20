/**
 * Badge Service
 *
 * Business logic for badge evaluation and awarding.
 * Evaluates badge criteria and automatically awards badges when earned.
 *
 * Responsibilities:
 * - Evaluate badge conditions
 * - Track badge-worthy events
 * - Award badges
 * - Prevent duplicate awards
 */

import { BADGE_DEFINITIONS, BadgeContext, BadgeDefinition } from '@/core/domain/entities/Badge';
import { Learner } from '@/core/domain/entities/Learner';
import { ILearnerRepository } from '@/core/domain/repositories/ILearnerRepository';

export interface BadgeAwardResult {
  badgesAwarded: string[];
  badgeDetails: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export class BadgeService {
  constructor(private readonly learnerRepository: ILearnerRepository) {}

  /**
   * Get all badge definitions
   */
  getAllBadges(): BadgeDefinition[] {
    return BADGE_DEFINITIONS;
  }

  /**
   * Get a specific badge definition
   */
  getBadge(badgeId: string): BadgeDefinition | undefined {
    return BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  }

  /**
   * Evaluate which badges a learner has earned
   * and haven't received yet
   */
  async evaluateEarnedBadges(learnerId: string): Promise<BadgeAwardResult> {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) {
        return { badgesAwarded: [], badgeDetails: [] };
      }

      const context = this.buildBadgeContext(learner);
      const newBadges: string[] = [];

      for (const badgeDef of BADGE_DEFINITIONS) {
        // Skip if already earned
        if (learner.badges.includes(badgeDef.id)) {
          continue;
        }

        // Check if condition is met
        if (badgeDef.condition(context)) {
          const awarded = await this.learnerRepository.addBadge(learnerId, badgeDef.id);
          if (awarded) {
            newBadges.push(badgeDef.id);
            console.log(`🏆 Badge awarded: ${badgeDef.name} to ${learnerId}`);
          }
        }
      }

      // Get details for awarded badges
      const badgeDetails = newBadges.map((badgeId) => {
        const badge = this.getBadge(badgeId);
        return {
          id: badgeId,
          name: badge?.name || 'Unknown',
          description: badge?.description || '',
        };
      });

      return { badgesAwarded: newBadges, badgeDetails };
    } catch (error) {
      console.error('❌ Failed to evaluate badges:', error);
      return { badgesAwarded: [], badgeDetails: [] };
    }
  }

  /**
   * Check if a specific badge condition is met
   */
  async checkBadgeCondition(learnerId: string, badgeId: string): Promise<boolean> {
    try {
      const learner = await this.learnerRepository.findBySessionId(learnerId);
      if (!learner) {
        return false;
      }

      const badge = this.getBadge(badgeId);
      if (!badge) {
        return false;
      }

      const context = this.buildBadgeContext(learner);
      return badge.condition(context);
    } catch (error) {
      console.error('❌ Failed to check badge condition:', error);
      return false;
    }
  }

  /**
   * Award a specific badge to a learner
   * (bypass condition check - use with caution)
   */
  async awardBadge(learnerId: string, badgeId: string): Promise<boolean> {
    try {
      console.log(`🎁 Manually awarding badge ${badgeId} to ${learnerId}`);
      return this.learnerRepository.addBadge(learnerId, badgeId);
    } catch (error) {
      console.error('❌ Failed to award badge:', error);
      return false;
    }
  }

  /**
   * Get learner's earned badges with full details
   */
  async getLearnerBadges(learnerId: string): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
    }>
  > {
    try {
      const badgeIds = await this.learnerRepository.getBadges(learnerId);

      return badgeIds
        .map((badgeId) => {
          const badge = this.getBadge(badgeId);
          return badge
            ? {
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon,
              }
            : null;
        })
        .filter((badge): badge is Exclude<typeof badge, null> => badge !== null);
    } catch (error) {
      console.error('❌ Failed to get learner badges:', error);
      return [];
    }
  }

  /**
   * Check progress towards earning a specific badge
   * Returns a percentage of completion (0-100)
   */
  getProgressTowardsBadge(
    context: BadgeContext,
    badgeId: string
  ): {
    progress: number;
    description: string;
  } {
    const badge = this.getBadge(badgeId);
    if (!badge) {
      return { progress: 0, description: 'Badge not found' };
    }

    // Check if already earned
    if (badge.condition(context)) {
      return { progress: 100, description: 'Badge earned!' };
    }

    // Calculate progress based on badge type
    switch (badgeId) {
      case 'first-steps':
        const firstStepsProgress =
          Math.min(context.completedChallenges.length, 1) * 100;
        return {
          progress: firstStepsProgress,
          description: `Complete 1 challenge (${context.completedChallenges.length}/1)`,
        };

      case 'shape-starter':
        const beginnerIds = ['draw-line', 'draw-square', 'draw-rectangle', 'draw-triangle'];
        const beginnerComplete = beginnerIds.filter((id) =>
          context.completedChallenges.includes(id)
        ).length;
        return {
          progress: (beginnerComplete / 4) * 100,
          description: `Complete all beginner shapes (${beginnerComplete}/4)`,
        };

      case 'speed-runner':
        return {
          progress: Math.min(context.currentStreak, 3) * 33.33,
          description: `3-challenge streak (${context.currentStreak}/3)`,
        };

      case 'perfectionist':
        const perfectProgress = Math.min(context.totalSubmissions, 5);
        return {
          progress: (perfectProgress / 5) * (context.lastFiveCorrect ? 100 : 80),
          description: `5 perfect submissions (${context.totalSubmissions}/5)`,
        };

      case 'centurion':
        return {
          progress: Math.min(context.xp, 100),
          description: `Earn 100 XP (${context.xp}/100)`,
        };

      case 'level-3':
        return {
          progress: (context.level / 3) * 100,
          description: `Reach Level 3 (${context.level}/3)`,
        };

      default:
        return { progress: 0, description: 'Unknown badge' };
    }
  }

  /**
   * ========== PRIVATE HELPERS ==========
   */

  /**
   * Build badge context from learner data
   * Used for evaluating badge conditions
   */
  private buildBadgeContext(learner: Learner): BadgeContext {
    const completedChallenges = learner.challenges_completed || [];
    const totalSubmissions = learner.missionCount + (completedChallenges.length || 0);
    const successfulSubmissions = learner.completedMissions + (completedChallenges.length || 0);

    // Calculate current streak (simplified - just count recent completions)
    const currentStreak = Math.min(completedChallenges.length, 10); // Max 10 visible

    // Check if last 5 submissions were correct
    // Simplified: if they have at least 5 completions and recent ratio is good
    const lastFiveCorrect =
      totalSubmissions >= 5 && (successfulSubmissions / totalSubmissions >= 0.8);

    const totalHintsEver = Object.values(learner.hints_used || {}).reduce(
      (sum, count) => sum + count,
      0
    );

    return {
      completedChallenges,
      totalSubmissions,
      successfulSubmissions,
      currentStreak,
      xp: learner.xp,
      level: learner.level,
      hintsUsed: 0, // Current submission hints - set elsewhere
      totalHintsEver,
      lastFiveCorrect,
    };
  }
}