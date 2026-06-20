import type { Mission } from '@/core/domain/entities/Mission';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';
import { RoverHttpClient, type RoverConfig } from '@/infrastructure/rover/RoverHttpClient';
import { createRoverPayload } from '@/infrastructure/rover/types/RoverPayload';

export type GroundStationConnectionStatus = 'offline' | 'connecting' | 'online';

/**
 * Ground Station Dispatch Service
 *
 * Handles dispatching missions to remote rovers via HTTP.
 * Implements User Story 1 (Sprint 2 Epic 1) - HTTP Client for Remote Rover Communication.
 *
 * Responsibilities:
 * - Build mission payloads from Mission entities
 * - Send missions to rovers via RoverHttpClient
 * - Update mission status in Firestore based on dispatch result
 * - Retry failed dispatches (1 retry before giving up)
 *
 * Communication flow:
 * 1. Mission is in 'queued' status
 * 2. dispatchMission() builds payload and sends to rover
 * 3. On success: update status to 'processing' (rover is executing)
 * 4. On failure: update status to 'failed' with error message
 * 5. Execution results are handled separately (SSE streaming, User Story 2)
 */
export class GroundStationDispatchService {
  private readonly httpClient: RoverHttpClient;
  private readonly maxRetries = 1;

  constructor(private readonly missionRepository: IMissionRepository) {
    this.httpClient = new RoverHttpClient();
  }

  /**
   * Dispatch a mission to the rover for execution
   *
   * @param mission - Mission to dispatch (must have code and id)
   * @param roverConfig - Rover connection details (IP and port)
   * @returns Promise that resolves when dispatch completes (success or failure)
   *
   * @example
   * ```typescript
   * const config: RoverConfig = { ip: '192.168.1.100', port: 8523 };
   * await dispatchService.dispatchMission(mission, config);
   * // Mission status updated to 'processing' or 'failed'
   * ```
   */
  async dispatchMission(mission: Mission, roverConfig: RoverConfig): Promise<void> {
    console.log(`[Dispatch] ${mission.name || mission.id} → ${roverConfig.ip}:${roverConfig.port}`);

    // Build payload
    const payload = createRoverPayload(mission.code, mission.id);

    // Attempt to send with retry
    let attempts = 0;
    let lastError = '';
    let lastValidationErrors: string[] = [];

    while (attempts <= this.maxRetries) {
      attempts++;

      const result = await this.httpClient.sendMissionToRover(
        roverConfig.ip,
        roverConfig.port,
        payload
      );

      if (result.success) {
        // Success - update mission to 'processing'

        // Check if rover returned immediate status (error or completed)
        const firstInstruction = result.rawResponse?.instructions?.[0];
        const instructionStatus = firstInstruction?.status;

        // Check for immediate error from rover
        if (instructionStatus === 'error') {
          const instructionWithError = firstInstruction as typeof firstInstruction & { error?: string };
          const errorMessage = instructionWithError.error || result.rawResponse?.error || 'Rover execution error';
          console.error(`[Dispatch] ✗ ${mission.name || mission.id} failed:`, errorMessage);

          await this.missionRepository.update(mission.id, {
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            executionResult: {
              isSuccessful: false,
              consoleOutput: JSON.stringify(result.rawResponse, null, 2),
              errorMessage,
            },
          });
          return;
        }

        // Check if this is a simulator response (has trajectory data)
        // Simulators execute synchronously and return results immediately
        const isSimulatorResponse = firstInstruction && 'trajectory' in firstInstruction;

        if (isSimulatorResponse) {
          // Simulator completed execution - mark as completed immediately
          console.log(`[Dispatch] ✓ ${mission.name || mission.id} completed`);

          // Check if execution was successful or had an error
          const executionStatus = firstInstruction.status;
          const isSuccessful = executionStatus === 'completed';
          const instructionWithError = firstInstruction as typeof firstInstruction & { error?: string };
          const errorMessage = isSuccessful ? '' : (instructionWithError.error || result.rawResponse?.error || 'Unknown error');

          await this.missionRepository.update(mission.id, {
            status: isSuccessful ? 'completed' : 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            executionResult: {
              isSuccessful,
              consoleOutput: JSON.stringify(result.rawResponse, null, 2),
              errorMessage,
            },
          });
        } else {
          // Physical rover - mission is being processed asynchronously
          await this.missionRepository.update(mission.id, {
            status: 'processing',
            startedAt: new Date().toISOString(),
          });
        }

        return;
      }

      // Failure - log and potentially retry
      lastError = result.message;
      lastValidationErrors = result.rawResponse?.validation_errors ?? [];

      const hasValidationErrors = Boolean(result.rawResponse?.validation_errors?.length);
      const isClientValidationFailure = result.statusCode === 400 && hasValidationErrors;

      if (isClientValidationFailure) {
        console.error(`[Dispatch] ✗ ${mission.name || mission.id} validation failed`);
        break;
      }

      if (attempts <= this.maxRetries) {
        console.log(`[Dispatch] Retry ${attempts}/${this.maxRetries}...`);
        // Brief delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // All retries exhausted - mark mission as failed
    console.error(`[Dispatch] ✗ ${mission.name || mission.id} failed after ${attempts} attempts`);

    // Keep a concise top-line summary for operator UI.
    let errorMessage = `Failed to dispatch mission: ${lastError}`;

    if (lastValidationErrors.length > 0) {
      errorMessage = `Code validation failed:\n${lastValidationErrors.join('\n')}`;
    } else if (lastError === 'Code validation failed') {
      errorMessage = 'Code validation failed. Update rover commands and retry.';
    }

    await this.missionRepository.update(mission.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      executionResult: {
        isSuccessful: false,
        consoleOutput: '',
        errorMessage,
      },
    });
  }

  // TODO: User Story 64 / Tasks 65-69 - deliver missions over a reliable cloud connection.
  // TODO: User Story 71 / Tasks 72-76 - manage execution lifecycle handoff to the GSA.
  async getConnectionStatus(): Promise<GroundStationConnectionStatus> {
    return 'offline';
  }
}
