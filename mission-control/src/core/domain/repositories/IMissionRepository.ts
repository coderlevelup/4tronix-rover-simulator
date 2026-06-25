/**
 * Mission Repository Interface
 *
 * Implements the Repository pattern and Dependency Inversion Principle (SOLID).
 * Domain layer defines the contract; infrastructure layer provides concrete implementation.
 *
 * This allows us to:
 * - Swap Firestore for Redis, Cloud Tasks, or other queue systems
 * - Mock the repository for unit testing
 * - Keep business logic independent of persistence details
 */

import { Mission } from '../entities/Mission';

export interface IMissionRepository {
  /**
   * Create a new mission in the queue
   * @param mission - Mission data (id will be generated if not provided)
   * @returns Created mission with generated ID and calculated queue position
   */
  create(mission: Omit<Mission, 'id' | 'queuePosition' | 'estimatedWait'>): Promise<Mission>;

  /**
   * Find a mission by ID
   * @param id - Mission ID
   * @returns Mission or null if not found
   */
  findById(id: string): Promise<Mission | null>;

  /**
   * Find all missions for a specific learner (for mission history)
   * @param learnerId - Learner ID
   * @returns Array of missions ordered by submittedAt (newest first)
   */
  findByLearnerId(learnerId: string): Promise<Mission[]>;

  /**
   * @deprecated Use findByLearnerId instead. Find all missions for a specific session (for learner history)
   * @param sessionId - Browser session ID
   * @returns Array of missions ordered by submittedAt (newest first)
   */
  findBySessionId(sessionId: string): Promise<Mission[]>;

  /**
   * Get all queued missions for a specific yard
   * Used for queue position calculation and operator console
   * @param yardId - Yard ID
   * @returns Array of queued missions ordered by submittedAt (FIFO)
   */
  getQueuedMissions(yardId: string): Promise<Mission[]>;

  /**
   * Update mission status and related fields
   * @param id - Mission ID
   * @param updates - Partial mission data to update
   * @returns Updated mission or null if not found
   */
  update(id: string, updates: Partial<Mission>): Promise<Mission | null>;

  /**
   * Get count of missions in queue for a specific yard
   * @param yardId - Yard ID
   * @returns Number of missions with status 'queued'
   */
  getQueueLength(yardId: string): Promise<number>;

  /**
   * Get all missions across all yards (for operator dashboard)
   * @returns Array of all missions ordered by submittedAt (newest first)
   */
  findAll(): Promise<Mission[]>;
}
