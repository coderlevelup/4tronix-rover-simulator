/**
 * Learner Domain Entity
 *
 * Represents an anonymous learner in the system.
 * No email or password required - identified via browser fingerprint.
 *
 * Design principles:
 * - Privacy-first: No PII collected
 * - Session-based: Uses nanoid for unique identification
 * - Progressive enhancement: Can be upgraded to authenticated user later
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
 * Sanitizes display name input (removes PII patterns)
 */
export function sanitizeDisplayName(input: string): string {
  // Remove email patterns
  const noEmail = input.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

  // Limit length and trim
  return noEmail.trim().substring(0, 20);
}
