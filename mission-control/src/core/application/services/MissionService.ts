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
import { hashLearnerEmail } from '@/core/domain/services/learnerEmailHash';
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
      // The address is accepted over HTTPS but never persisted on the mission:
      // mission documents are world-readable, so only the hash is stored. The
      // address itself lives on the learner record, written by the client.
      const learnerEmailHash = dto.learnerEmail
        ? await hashLearnerEmail(dto.learnerEmail)
        : undefined;

      const mission = await this.missionRepository.create({
        yardId: dto.yardId,
        learnerId: dto.learnerId,
        sessionId: dto.sessionId,
        learnerEmailHash,
        name: dto.name,
        code: dto.code,
        blocklyState: dto.blocklyState,
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
