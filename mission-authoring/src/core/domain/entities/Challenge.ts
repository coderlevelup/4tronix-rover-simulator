export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface ChallengeHint {
  level: number;
  text: string;
}

export interface ExpectedShape {
  shape: string;
  length?: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface ExpectedOutput {
  shapes: ExpectedShape[];
  tolerance: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: ChallengeDifficulty;
  starterCode?: string;
  expectedOutput: ExpectedOutput;
  requiredLevel: number;
  prerequisites: string[];
  xpReward: number;
  points: number;
  badgeReward?: string;
  hints: ChallengeHint[];
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChallengeProgress {
  learnerId: string;
  challengeId: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  attemptsCount: number;
  hintsRevealed: number;
  xpAwarded: number;
  badgeAwarded: boolean;
  unlockedAt?: string;
  completedAt?: string;
  lastAttemptAt: string;
}

export { canAttemptChallenge, getAvailableChallenges, getNextRecommendedChallenge, calculateXPReward, CHALLENGES } from '@/data/challenges';
export type { ChallengeDifficulty as ChallengeDifficultyType, ChallengeHint as ChallengeHintType, ExpectedShape as ExpectedShapeType, ExpectedOutput as ExpectedOutputType, ChallengeProgress as ChallengeProgressType };
