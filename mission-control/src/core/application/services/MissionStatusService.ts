/**
 * Mission Status Service
 *
 * Provides mission status for learner polling (User Story 54, Task 56).
 * Returns mission with live queue position and estimated wait time.
 *
 * Implementation Details:
 * - Delegates to FirestoreMissionRepository which calculates queue position dynamically
 * - Queue position is computed by counting missions submitted before this one
 * - Estimated wait assumes 90 seconds average execution time per mission
 * - Status updates happen in real-time as missions move through the queue
 */

import type { Mission } from '@/core/domain/entities/Mission';
import type { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';

export class MissionStatusService {
  /**
   * Constructor - Dependency Injection Pattern
   * @param missionRepository - Repository implementation (Firestore in production)
   */
  constructor(private readonly missionRepository: IMissionRepository) {}

  /**
   * Get mission status with live queue position
   * Used by learners to poll their mission status after submission
   *
   * Queue Position Calculation:
   * - For queued missions: counts how many missions are ahead in the same yard
   * - Position updates as missions complete and are removed from queue
   * - Returns null if mission doesn't exist
   *
   * @param missionId - Unique mission identifier returned from POST /api/missions
   * @returns Mission with current queue position and estimated wait, or null if not found
   */
  async getMissionStatus(missionId: string): Promise<Mission | null> {
    // Repository handles queue position calculation internally
    // See FirestoreMissionRepository.findById() for implementation details
    return this.missionRepository.findById(missionId);
  }
}
