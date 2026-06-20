/**
 * Challenge Domain Entity
 *
 * Represents a coding challenge that learners can attempt.
 * Challenges are distinct from Missions - they are pre-defined exercises
 * with expected outputs, validation rules, and rewards.
 *
 * Design:
 * - Challenges are immutable (created by instructors)
 * - Each challenge has difficulty, hints, and XP reward
 * - Challenges can have prerequisites (must complete Challenge X first)
 * - Challenges can unlock badges when completed
 */

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface ChallengeHint {
  level: number;                    // 1, 2, or 3
  text: string;                     // Hint text
}

export interface ExpectedShape {
  shape: string;                    // 'line', 'square', 'circle', etc.
  length?: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface ExpectedOutput {
  shapes: ExpectedShape[];          // Expected shapes to be drawn
  tolerance: number;                // Pixel tolerance for matching
}

export interface Challenge {
  // Identifiers
  id: string;                       // Unique challenge ID (e.g., "draw-square")

  // Content
  title: string;                    // Challenge title
  description: string;              // Challenge description
  category: string;                 // Category (e.g., "shapes", "patterns")
  difficulty: ChallengeDifficulty;  // beginner | intermediate | advanced

  // Code & Execution
  starterCode?: string;             // Optional starter code template
  expectedOutput: ExpectedOutput;   // Expected simulator output

  // Progression
  requiredLevel: number;            // Minimum learner level to unlock (1-5)
  prerequisites: string[];          // Challenge IDs that must be completed first

  // Rewards
  xpReward: number;                 // Base XP reward (may be reduced if hints used)
  points: number;                   // Legacy points field (deprecated, using xpReward)
  badgeReward?: string;             // Badge ID awarded on completion (optional)

  // Hints
  hints: ChallengeHint[];           // Progressive hints (typically 3)

  // Metadata
  orderIndex: number;               // Display order
  createdAt?: string;               // When challenge was created
  updatedAt?: string;               // When challenge was last updated
}

/**
 * Learner's challenge progress/status
 * Stored in a separate subcollection or document
 */
export interface ChallengeProgress {
  // Identifiers
  learnerId: string;                // Learner ID
  challengeId: string;              // Challenge ID

  // Status
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';

  // Tracking
  attemptsCount: number;            // Number of attempts
  hintsRevealed: number;            // Number of hints revealed (0-3)
  xpAwarded: number;                // XP actually awarded (may be reduced)
  badgeAwarded: boolean;            // Whether badge was awarded

  // Timestamps
  unlockedAt?: string;              // When first unlocked
  completedAt?: string;             // When successfully completed
  lastAttemptAt: string;            // Last submission timestamp
}

/**
 * Get the XP reward, reduced by hints if applicable
 * For now: each hint used reduces XP by 10%
 * (modify this function to adjust the penalty)
 */
export function calculateXPReward(baseXP: number, hintsUsed: number): number {
  // Max 3 hints, each reduces XP by 10%
  const penaltyPerHint = 0.1;
  const totalPenalty = Math.min(hintsUsed, 3) * penaltyPerHint;
  const penaltyFactor = 1 - totalPenalty;

  return Math.max(1, Math.floor(baseXP * penaltyFactor));
}

/**
 * Determine if a learner can attempt a challenge
 * Checks level requirement and prerequisites
 */
export function canAttemptChallenge(
  learner: { level: number; challenges_completed: string[] },
  challenge: Challenge
): boolean {
  // Check level requirement
  if (learner.level < challenge.requiredLevel) {
    return false;
  }

  // Check prerequisites
  if (challenge.prerequisites && challenge.prerequisites.length > 0) {
    const allPrerequisitesMet = challenge.prerequisites.every((prereqId) =>
      learner.challenges_completed.includes(prereqId)
    );

    if (!allPrerequisitesMet) {
      return false;
    }
  }

  return true;
}

/**
 * Get challenges that a learner can currently attempt
 */
export function getAvailableChallenges(
  learner: { level: number; challenges_completed: string[] },
  allChallenges: Challenge[]
): Challenge[] {
  return allChallenges.filter((challenge) => canAttemptChallenge(learner, challenge));
}

/**
 * Get the next recommended challenge for a learner
 * Returns first uncompleted challenge they can attempt
 */
export function getNextRecommendedChallenge(
  learner: { level: number; challenges_completed: string[] },
  allChallenges: Challenge[]
): Challenge | null {
  const available = getAvailableChallenges(learner, allChallenges);
  return (
    available.find((c) => !learner.challenges_completed.includes(c.id)) || null
  );
}
export const CHALLENGES: Challenge[] = [
  {
    id: 'draw-square',
    title: 'Draw a Square',
    description: 'Use the simulator to draw a perfect square.',
    category: 'shapes',
    difficulty: 'beginner',
    requiredLevel: 1,
    prerequisites: [],
    xpReward: 50,
    points: 50,
    hints: [
      { level: 1, text: 'A square has 4 equal sides.' },
      { level: 2, text: 'Each angle is 90 degrees.' },
      { level: 3, text: 'Use repeat movement + rotation.' }
    ],
    expectedOutput: {
      shapes: [
        { shape: 'square', length: 100 }
      ],
      tolerance: 5
    },
    orderIndex: 1
  },

  {
    id: 'draw-circle',
    title: 'Draw a Circle',
    description: 'Create a smooth circle using the simulator.',
    category: 'shapes',
    difficulty: 'intermediate',
    requiredLevel: 2,
    prerequisites: ['draw-square'],
    xpReward: 100,
    points: 100,
    hints: [
      { level: 1, text: 'Circles are made using small steps or arc functions.' },
      { level: 2, text: 'Think in terms of radius.' },
      { level: 3, text: 'Reduce step size for smoothness.' }
    ],
    expectedOutput: {
      shapes: [
        { shape: 'circle', radius: 50 }
      ],
      tolerance: 5
    },
    orderIndex: 2
  }
];