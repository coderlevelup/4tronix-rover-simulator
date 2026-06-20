/**
 * Rover Mission Payload Types
 *
 * Defines the payload structure for HTTP communication with the 4tronix rover server.
 * Based on the /queue/add endpoint from yard/rover/rover_server.py and service.py.
 *
 * The rover server expects a payload with:
 * - apiVersion: 'v1' (API version for backward/forward compatibility)
 * - cmd: 'run_python' (tells the rover to execute Python code)
 * - params: { code: string, id: string }
 *
 * The id field is echoed back in the response to correlate execution results.
 *
 * API versioning allows the system to dynamically handle different rover software versions
 * without breaking changes. Future versions (v2, v3) can introduce new features while
 * maintaining compatibility with older rovers.
 *
 * @see yard/rover/service.py:283-313 for run_python command handling
 * @see yard/rover/rover_server.py:35-48 for /queue/add endpoint
 */

/**
 * Supported API versions for rover communication
 */
export type RoverApiVersion = 'v1';

/**
 * Payload sent to the rover's /queue/add endpoint
 *
 * @example
 * ```typescript
 * const payload: RoverMissionPayload = {
 *   apiVersion: 'v1',
 *   cmd: 'run_python',
 *   params: {
 *     code: 'rover.forward(60)\ntime.sleep(2)\nrover.stop()',
 *     id: 'mission-abc123'
 *   }
 * };
 * ```
 */
export interface RoverMissionPayload {
  /** API version - ensures compatibility between mission control and rover software */
  apiVersion: RoverApiVersion;

  /** Command type - must be 'run_python' for mission execution */
  cmd: 'run_python';

  /** Parameters for the run_python command */
  params: {
    /** Python code to execute on the rover */
    code: string;

    /** Mission ID - echoed back in response for correlation */
    id: string;
  };
}

/**
 * Response from the rover's /queue/add endpoint
 *
 * @example
 * ```typescript
 * const response: RoverQueueResponse = {
 *   apiVersion: 'v1',
 *   status: 'ok',
 *   added: 1,
 *   instructions: [{
 *     id: 'rover-generated-uuid',
 *     apiVersion: 'v1',
 *     cmd: 'run_python',
 *     params: { code: '...', id: 'mission-abc123' },
 *     timestamp: '2026-05-13T12:00:00.000Z',
 *     status: 'pending'
 *   }]
 * };
 * ```
 */
export interface RoverQueueResponse {
  /** API version echoed back from rover */
  apiVersion?: RoverApiVersion;

  /** Status of the add operation */
  status: 'ok' | 'error';

  /** Number of instructions added to the queue */
  added: number;

  /** List of instructions that were added with their server-assigned metadata */
  instructions: Array<{
    /** Server-generated UUID for this instruction */
    id: string;

    /** API version used for this instruction */
    apiVersion?: RoverApiVersion;

    /** Command type */
    cmd: string;

    /** Command parameters (contains our mission ID) */
    params: {
      code: string;
      id: string;
    };

    /** ISO timestamp when instruction was queued */
    timestamp: string;

    /** Current status of the instruction */
    status: 'pending' | 'executing' | 'completed' | 'error';
  }>;

  /** Error message if status is 'error' */
  error?: string;

  /** Validation errors from code validation failures */
  validation_errors?: string[];

  /** Unsupported API version warning (if rover doesn't support requested version) */
  unsupportedVersion?: boolean;
}

/**
 * Validates a RoverMissionPayload
 *
 * @param payload - The payload to validate
 * @returns True if valid, throws Error otherwise
 * @throws {Error} If payload is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateRoverPayload(payload);
 *   // Payload is valid, safe to send
 * } catch (error) {
 *   console.error('Invalid payload:', error.message);
 * }
 * ```
 */
export function validateRoverPayload(payload: unknown): asserts payload is RoverMissionPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.apiVersion !== 'string' || p.apiVersion !== 'v1') {
    throw new Error('Payload apiVersion must be "v1"');
  }

  if (p.cmd !== 'run_python') {
    throw new Error('Payload cmd must be "run_python"');
  }

  if (!p.params || typeof p.params !== 'object') {
    throw new Error('Payload params must be an object');
  }

  const params = p.params as Record<string, unknown>;

  if (typeof params.code !== 'string' || params.code.trim().length === 0) {
    throw new Error('Payload params.code must be a non-empty string');
  }

  if (typeof params.id !== 'string' || params.id.trim().length === 0) {
    throw new Error('Payload params.id must be a non-empty string');
  }
}

/**
 * Creates a RoverMissionPayload from mission code and ID
 *
 * @param code - Python code to execute
 * @param missionId - Mission ID for correlation
 * @param apiVersion - API version to use (defaults to 'v1')
 * @returns A valid RoverMissionPayload
 *
 * @example
 * ```typescript
 * const payload = createRoverPayload(
 *   'rover.forward(60)\ntime.sleep(2)\nrover.stop()',
 *   'mission-abc123'
 * );
 * // { apiVersion: 'v1', cmd: 'run_python', params: { code: '...', id: 'mission-abc123' } }
 * ```
 */
export function createRoverPayload(
  code: string,
  missionId: string,
  apiVersion: RoverApiVersion = 'v1'
): RoverMissionPayload {
  const payload: RoverMissionPayload = {
    apiVersion,
    cmd: 'run_python',
    params: {
      code,
      id: missionId,
    },
  };

  validateRoverPayload(payload);
  return payload;
}
