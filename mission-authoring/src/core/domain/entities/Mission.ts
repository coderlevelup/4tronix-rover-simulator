/**
 * Mission Domain Entity
 *
 * Represents a learner's submitted rover control program.
 * Inspired by yard/rover/service.py queue semantics from the existing repo.
 *
 * Design decisions:
 * - Supports anonymous learners via sessionId (POPIA compliance - no email required)
 * - Status field enables Firestore-as-queue pattern
 * - Queue position calculated dynamically for real-time updates
 */

export type MissionStatus =
  | 'queued'      // Waiting to be executed
  | 'processing'  // Currently being executed by rover
  | 'completed'   // Successfully executed
  | 'failed'      // Execution failed
  | 'cancelled';  // Cancelled by operator or system

export interface ExecutionResult {
  isSuccessful: boolean;
  consoleOutput: string;
  errorMessage?: string;
}

export interface ExecutionMetadata {
  duration_ms?: number;
  error?: string;
  completed_at: string;
}

export interface Mission {
  // Identifiers
  id: string;                        // Firestore document ID
  yardId: string;                    // Which physical rover yard (e.g., "uct-rover-1")

  // Learner tracking
  learnerId: string;                 // Direct link to learner (formerly sessionId)
  sessionId: string;                 // Browser fingerprint for history tracking (kept for backward compatibility)
  learnerEmail?: string;             // Optional - lets a learner see history across devices by email
  learnerUid?: string;               // Optional - for when auth is added in future iterations

  // Payload
  name?: string;                     // Optional - mission name given by learner
  code: string;                      // Python code submitted by learner
  challengeId?: string;              // Optional - which challenge/level (e.g., "M1-FORWARD")

  // Queue management (inspired by yard/rover/service.py)
  status: MissionStatus;
  queuePosition?: number;            // Dynamic position in queue (calculated on read)
  estimatedWait?: number;            // Estimated wait time in seconds

  // Execution results (populated after execution)
  executionResult?: ExecutionResult;
  executionMetadata?: ExecutionMetadata;

  // Media artifacts
  videoUrl?: string;                 // Google Cloud Storage URL
  youtubeUrl?: string;               // Optional YouTube share URL

  // Timestamps (all stored as ISO strings for Firestore compatibility)
  submittedAt: string;               // When mission was submitted
  startedAt?: string;                // When execution began
  completedAt?: string;              // When execution finished
}

/**
 * Type guard to check if a mission is in an active state
 */
export function isActiveMission(mission: Mission): boolean {
  return mission.status === 'queued' || mission.status === 'processing';
}

/**
 * Type guard to check if a mission is terminal (no further state changes)
 */
export function isTerminalMission(mission: Mission): boolean {
  return mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled';
}
