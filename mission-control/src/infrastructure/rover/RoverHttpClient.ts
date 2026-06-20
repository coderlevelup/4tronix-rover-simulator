/**
 * Rover HTTP Client
 *
 * Client for communicating with the 4tronix rover server over HTTP.
 * Sends mission code to the rover's /queue/add endpoint.
 *
 * The rover server runs on each physical rover (Raspberry Pi) and accepts
 * HTTP POST requests with Python code to execute.
 *
 * Communication flow:
 * 1. Mission Control sends { cmd: 'run_python', params: { code, id } }
 * 2. Rover server queues the instruction and returns { status: 'ok', added: 1, ... }
 * 3. Rover executes code and streams results back via SSE (handled separately)
 *
 * @see yard/rover/rover_server.py for server implementation
 * @see yard/rover/service.py for queue processing
 */

import type { RoverMissionPayload, RoverQueueResponse } from './types/RoverPayload';
import { validateRoverPayload } from './types/RoverPayload';

/**
 * Result of sending a mission to the rover
 */
export interface SendMissionResult {
  /** Whether the mission was successfully queued */
  success: boolean;

  /** Human-readable message describing the result */
  message: string;

  /** Mission ID echoed back from the rover (for correlation) */
  id: string;

  /** Raw response from rover (for debugging) */
  rawResponse?: RoverQueueResponse;

  /** HTTP status code returned by rover endpoint when available */
  statusCode?: number;
}

/**
 * Configuration for rover HTTP connection
 */
export interface RoverConfig {
  /** Rover IP address (e.g., "192.168.1.100") */
  ip: string;

  /** Rover HTTP port (default: 8523) */
  port: number;
}

/**
 * HTTP Client for communicating with the 4tronix rover server
 */
export class RoverHttpClient {
  private readonly DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

  /**
   * Send a mission to the rover for execution
   *
   * @param roverIp - IP address of the rover
   * @param roverPort - HTTP port of the rover server (usually 8523)
   * @param payload - Mission payload with code and mission ID
   * @returns Result indicating success/failure and correlation ID
   *
   * @example
   * ```typescript
   * const client = new RoverHttpClient();
   * const payload = createRoverPayload(mission.code, mission.id);
   * const result = await client.sendMissionToRover(
   *   '192.168.1.100',
   *   8523,
   *   payload
   * );
   *
   * if (result.success) {
   *   console.log(`Mission ${result.id} queued successfully`);
   * } else {
   *   console.error(`Failed: ${result.message}`);
   * }
   * ```
   */
  async sendMissionToRover(
    roverIp: string,
    roverPort: number,
    payload: RoverMissionPayload
  ): Promise<SendMissionResult> {
    // Validate inputs
    if (!roverIp || typeof roverIp !== 'string') {
      return {
        success: false,
        message: 'Invalid rover IP address',
        id: payload.params.id,
      };
    }

    if (!roverPort || typeof roverPort !== 'number' || roverPort < 1 || roverPort > 65535) {
      return {
        success: false,
        message: 'Invalid rover port',
        id: payload.params.id,
      };
    }

    // Validate payload
    try {
      validateRoverPayload(payload);
    } catch (error) {
      return {
        success: false,
        message: `Invalid payload: ${error instanceof Error ? error.message : String(error)}`,
        id: payload.params.id,
      };
    }

    const missionId = payload.params.id;
    const code = payload.params.code;
    const apiVersion = payload.apiVersion;

    console.log(`[RoverHttpClient] Dispatching mission ${missionId}`);

    // Send to unified /queue/add endpoint (works for both physical rovers and simulators)
    const url = `http://${roverIp}:${roverPort}/queue/add`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([payload]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`[RoverHttpClient] Error (${response.status}): ${errorText.substring(0, 200)}...`);

        let parsedErrorResponse: RoverQueueResponse | undefined;
        try {
          parsedErrorResponse = JSON.parse(errorText) as RoverQueueResponse;
        } catch {
          parsedErrorResponse = undefined;
        }

        const detailedMessage =
          parsedErrorResponse?.error ||
          `Rover server error (${response.status}): ${errorText.substring(0, 200)}`;

        return {
          success: false,
          message: detailedMessage,
          id: missionId,
          rawResponse: parsedErrorResponse,
          statusCode: response.status,
        };
      }

      const data = (await response.json()) as RoverQueueResponse;

      // Check for API version mismatch warning
      if (data.unsupportedVersion) {
        console.warn(`[RoverHttpClient] Warning: Rover reported unsupported API version`);
      }

      if (data.apiVersion && data.apiVersion !== apiVersion) {
        console.warn(`[RoverHttpClient] API version mismatch: sent ${apiVersion}, rover responded with ${data.apiVersion}`);
      }

      if (data.status === 'error') {
        return {
          success: false,
          message: data.error || 'Rover server returned error status',
          id: missionId,
          rawResponse: data,
        };
      }

      if (!data.instructions || data.instructions.length === 0) {
        return {
          success: false,
          message: 'Rover server did not return queued instruction',
          id: missionId,
          rawResponse: data,
        };
      }

      const instruction = data.instructions[0];
      const echoedId = instruction.params?.id || missionId;

      console.log(`[RoverHttpClient] Mission ${echoedId} dispatched successfully`);

      return {
        success: true,
        message: `Mission queued successfully at position ${data.added}`,
        id: echoedId,
        rawResponse: data,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(`[RoverHttpClient] Timeout after ${this.DEFAULT_TIMEOUT_MS}ms`);
          return {
            success: false,
            message: `Request timeout after ${this.DEFAULT_TIMEOUT_MS / 1000} seconds`,
            id: missionId,
          };
        }

        console.error(`[RoverHttpClient] Network error:`, error.message);
        return {
          success: false,
          message: `Network error: ${error.message}`,
          id: missionId,
        };
      }

      console.error(`[RoverHttpClient] Unknown error:`, error);
      return {
        success: false,
        message: `Unknown error: ${String(error)}`,
        id: missionId,
      };
    }
  }

  /**
   * Send mission using RoverConfig object
   *
   * @param config - Rover configuration with IP and port
   * @param payload - Mission payload
   * @returns Result indicating success/failure
   *
   * @example
   * ```typescript
   * const config: RoverConfig = { ip: '192.168.1.100', port: 8523 };
   * const result = await client.sendMission(config, payload);
   * ```
   */
  async sendMission(config: RoverConfig, payload: RoverMissionPayload): Promise<SendMissionResult> {
    return this.sendMissionToRover(config.ip, config.port, payload);
  }
}
