/**
 * Mission Service
 *
 * Business logic layer for mission management.
 * Handles anonymous mission submission (User Story 35).
 *
 * Responsibilities:
 * - Coordinate mission creation
 * - Enforce business rules
 * - Orchestrate repository operations
 *
 * Follows Single Responsibility Principle (SOLID).
 */

import { Mission } from '@/core/domain/entities/Mission';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';
import { CreateMissionDto } from '@/infrastructure/validation/schemas';

export interface SubmitMissionResult {
  success: boolean;
  mission?: Mission;
  error?: string;
}

export class MissionService {
  constructor(private readonly missionRepository: IMissionRepository) {}

  /**
   * Submit a new mission (anonymous - no authentication required)
   * Implements User Story 35 and Task 38
   *
   * @param dto - Validated mission submission data
   * @returns Result with created mission or error
   */
  async submitMission(dto: CreateMissionDto): Promise<SubmitMissionResult> {
    try {
      const mission = await this.missionRepository.create({
        yardId: dto.yardId,
        learnerId: dto.learnerId,
        sessionId: dto.sessionId,
        learnerEmail: dto.learnerEmail,
        name: dto.name,
        code: dto.code,
        challengeId: dto.challengeId,
        status: 'queued',
        submittedAt: new Date().toISOString(),
      });

      return {
        success: true,
        mission,
      };
    } catch (error) {
      console.error('Failed to submit mission:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Get mission by ID
   *
   * @param id - Mission ID
   * @returns Mission or null if not found
   */
  async getMissionById(id: string): Promise<Mission | null> {
    return this.missionRepository.findById(id);
  }

  /**
   * Get mission history for a learner
   * Used for /history page
   *
   * @param learnerId - Learner ID
   * @returns Array of missions for this learner
   */
  async getMissionHistory(learnerId: string): Promise<Mission[]> {
    return this.missionRepository.findByLearnerId(learnerId);
  }

  /**
   * Get all queued missions for a yard
   * Used by operator console
   *
   * @param yardId - Yard ID
   * @returns Array of queued missions in FIFO order
   */
  async getQueueForYard(yardId: string): Promise<Mission[]> {
    return this.missionRepository.getQueuedMissions(yardId);
  }

  /**
   * Update mission status and results
   * Used by execution agent and operator console
   *
   * @param id - Mission ID
   * @param updates - Fields to update
   * @returns Updated mission or null if not found
   */
  async updateMission(id: string, updates: Partial<Mission>): Promise<Mission | null> {
    return this.missionRepository.update(id, updates);
  }
}
