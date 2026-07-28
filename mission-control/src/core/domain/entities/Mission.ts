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
  // One-way hash of the learner's email, NEVER the address itself: mission
  // documents are world-readable, so a plaintext address here is public. Lets a
  // learner find their missions from another device by hashing the address they
  // already know. The real address lives on the learner record.
  // See core/domain/services/learnerEmailHash.ts
  learnerEmailHash?: string;
  learnerUid?: string;               // Optional - for when auth is added in future iterations

  // Payload
  name?: string;                     // Optional - mission name given by learner
  code: string;                      // Python code submitted by learner
  blocklyState?: string;             // Serialized Blockly workspace JSON (block-built missions only)

  // Queue management (inspired by yard/rover/service.py)
  status: MissionStatus;
  queuePosition?: number;            // Dynamic position in queue (calculated on read)
  estimatedWait?: number;            // Estimated wait time in seconds

  // Execution results (populated after execution)
  executionResult?: ExecutionResult;
  executionMetadata?: ExecutionMetadata;

  //Locking (offline-sync lease mechanisms)
  lockOwner?: string | null;                 // Which rover is currently executing this mission (if any)
  lockedAt?: string | null;                   // When the mission was locked for execution (if any)
  leaseExpiresAt?: string | null;             // When the lock lease expires (if any)

  //Review
  needsReview?: boolean;              // Whether the mission needs review (e.g., for failed missions)
  reviewReason?: string | null;              // Optional - reason for review (e.g., "syntax error", "failed test case")

  //Confilct Resolution
  statusUpdatedAt?: string | null;          // When the status was last updated (for conflict resolution)

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
