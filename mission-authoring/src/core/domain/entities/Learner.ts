/**
 * Extended Learner Domain Entity
 *
 * Represents an anonymous learner in the system with gamification features.
 * No email or password required - identified via browser fingerprint.
 *
 * Design principles:
 * - Privacy-first: No PII collected
 * - Session-based: Uses nanoid for unique identification
 * - Progressive enhancement: Can be upgraded to authenticated user later
 * - Gamification: Tracks XP, levels, badges, and challenge progress
 *
 * Changes:
 * - Added xp: number (total XP earned)
 * - Added level: number (1-5 based on XP thresholds)
 * - Added badges: string[] (earned badge IDs)
 * - Added challenges_completed: string[] (completed challenge IDs)
 * - Added challenges_unlocked: string[] (unlocked challenge IDs)
 * - Added hints_used: Map<challengeId, number> (hint usage tracking)
 */

export interface Learner {
  // Identifiers
  id: string;                        // Unique learner ID (nanoid)
  sessionId: string;                 // Browser fingerprint for device linking

  // Optional profile (user-provided, not required)
  displayName?: string;              // Optional nickname (e.g., "RoverPilot123")
  avatarColor?: string;              // Random color for UI personalization
  learnerEmail?: string;             // Optional email for notifications / reminders

  // Activity tracking (missions)
  missionCount: number;              // Total missions submitted
  completedMissions: number;         // Successfully completed missions

  // Gamification: XP & Levels
  xp: number;                        // Total XP earned (default: 0)
  level: number;                     // Level 1-5 (calculated from XP thresholds)

  // Gamification: Challenges & Badges
  challenges_completed: string[];    // IDs of completed challenges
  challenges_unlocked: string[];     // IDs of unlocked challenges
  badges: string[];                  // Earned badge IDs
  hints_used: Record<string, number>; // Map of challengeId -> number of hints used

  // Timestamps
  createdAt: string;                 // When learner first accessed system
  lastActiveAt: string;              // Last activity timestamp

  // Device info (for multi-device detection)
  devices: LearnerDevice[];
}

export interface LearnerDevice {
  sessionId: string;                 // Unique session identifier
  firstSeenAt: string;               // When this device was first seen
  lastSeenAt: string;                // Last activity on this device
  deviceFingerprint?: string;        // Optional browser fingerprint hash
}

/**
 * XP thresholds for level progression
 * Levels are automatically calculated based on total XP
 */
export const LEVEL_THRESHOLDS = {
  1: 0,      // Rookie: 0-49 XP
  2: 50,     // Explorer: 50-149 XP
  3: 150,    // Builder: 150-299 XP
  4: 300,    // Engineer: 300-499 XP
  5: 500,    // Master: 500+ XP
} as const;

export type LevelThreshold = typeof LEVEL_THRESHOLDS;

/**
 * Calculate the level based on XP
 * @param xp Total XP earned
 * @returns Level 1-5
 */
export function calculateLevelFromXP(xp: number): number {
  if (xp >= LEVEL_THRESHOLDS[5]) return 5;
  if (xp >= LEVEL_THRESHOLDS[4]) return 4;
  if (xp >= LEVEL_THRESHOLDS[3]) return 3;
  if (xp >= LEVEL_THRESHOLDS[2]) return 2;
  return 1;
}

/**
 * Get the level name for a given level number
 * @param level Level 1-5
 * @returns Human-readable level name
 */
export function getLevelName(level: number): string {
  const names = {
    1: 'Rookie',
    2: 'Explorer',
    3: 'Builder',
    4: 'Engineer',
    5: 'Master',
  };
  return names[level as keyof typeof names] || 'Unknown';
}

/**
 * Get XP progress towards next level
 * @param xp Current XP
 * @returns { current: XP towards next level, required: XP needed for next level }
 */
export function getXPProgressToNextLevel(xp: number): { current: number; required: number } {
  const currentLevel = calculateLevelFromXP(xp);
  if (currentLevel === 5) {
    return { current: xp - LEVEL_THRESHOLDS[5], required: 0 }; // Master level
  }

  const nextLevelThreshold = LEVEL_THRESHOLDS[(currentLevel + 1) as keyof typeof LEVEL_THRESHOLDS];
  const currentLevelThreshold = LEVEL_THRESHOLDS[currentLevel as keyof typeof LEVEL_THRESHOLDS];

  return {
    current: xp - currentLevelThreshold,
    required: nextLevelThreshold - currentLevelThreshold,
  };
}

/**
 * Creates a new anonymous learner with default values
 */
export function createAnonymousLearner(sessionId: string): Learner {
  const now = new Date().toISOString();

  return {
    id: sessionId, // Use sessionId as the learner ID for simplicity
    sessionId,
    avatarColor: generateRandomColor(),
    missionCount: 0,
    completedMissions: 0,
    xp: 0,
    level: 1,
    challenges_completed: [],
    challenges_unlocked: [],
    badges: [],
    hints_used: {},
    createdAt: now,
    lastActiveAt: now,
    devices: [
      {
        sessionId,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ],
  };
}

/**
 * Generates a random avatar color for visual personalization
 */
function generateRandomColor(): string {
  const colors = [
    '#EF4444', // red
    '#F59E0B', // amber
    '#10B981', // emerald
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#06B6D4', // cyan
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Type guard to check if learner has completed any missions
 */
export function isActiveLearner(learner: Learner): boolean {
  return learner.missionCount > 0;
}

/**
 * Type guard to check if learner has attempted any challenges
 */
export function hasChallengeProgress(learner: Learner): boolean {
  return learner.challenges_completed.length > 0 || learner.xp > 0;
}

/**
 * Sanitizes display name input (removes PII patterns)
 */
export function sanitizeDisplayName(input: string): string {
  // Remove email patterns
  const noEmail = input.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

  // Limit length and trim
  return noEmail.trim().substring(0, 20);
}