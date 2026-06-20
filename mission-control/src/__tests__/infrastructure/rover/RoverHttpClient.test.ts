/**
 * Tests for RoverHttpClient
 *
 * Verifies HTTP communication with the 4tronix rover server.
 * Mocks fetch to test various scenarios without hitting real network.
 *
 * Coverage targets:
 * - Success path: mission queued successfully
 * - Error paths: network errors, timeouts, non-2xx responses, invalid responses
 * - Payload validation: ensures exactly { code, id } structure
 * - ID correlation: verifies echoed ID is used correctly
 */

import { RoverHttpClient } from '@/infrastructure/rover/RoverHttpClient';
import { createRoverPayload } from '@/infrastructure/rover/types/RoverPayload';

// Mock fetch globally
global.fetch = jest.fn();

describe('RoverHttpClient', () => {
  let client: RoverHttpClient;
  const TEST_IP = '192.168.1.100';
  const TEST_PORT = 8523;
  const TEST_MISSION_ID = 'mission-test-123';
  const TEST_CODE = 'rover.forward(60)\ntime.sleep(2)\nrover.stop()';

  beforeEach(() => {
    client = new RoverHttpClient();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendMissionToRover - Success Cases', () => {
    it('successfully sends mission and returns success result', async () => {
      // Mock successful response
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-uuid-456',
            cmd: 'run_python',
            params: {
              code: TEST_CODE,
              id: TEST_MISSION_ID,
            },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_MISSION_ID);
      expect(result.message).toContain('queued successfully');
      expect(result.rawResponse).toEqual(mockResponse);
    });

    it('sends POST request to correct URL', async () => {
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-uuid',
            cmd: 'run_python',
            params: { code: TEST_CODE, id: TEST_MISSION_ID },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(global.fetch).toHaveBeenCalledWith(
        `http://${TEST_IP}:${TEST_PORT}/queue/add`,
        expect.any(Object)
      );
    });

    it('sends payload as JSON array with correct structure', async () => {
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-uuid',
            cmd: 'run_python',
            params: { code: TEST_CODE, id: TEST_MISSION_ID },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const fetchOptions = fetchCall[1];

      expect(fetchOptions.method).toBe('POST');
      expect(fetchOptions.headers['Content-Type']).toBe('application/json');

      const sentBody = JSON.parse(fetchOptions.body);
      expect(Array.isArray(sentBody)).toBe(true);
      expect(sentBody).toHaveLength(1);
      expect(sentBody[0]).toEqual({
        apiVersion: 'v1',
        cmd: 'run_python',
        params: {
          code: TEST_CODE,
          id: TEST_MISSION_ID,
        },
      });
    });

    it('extracts echoed mission ID from response params', async () => {
      const echoedId = 'mission-echoed-789';
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-instruction-uuid',
            cmd: 'run_python',
            params: {
              code: TEST_CODE,
              id: echoedId, // This is what we care about
            },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.id).toBe(echoedId);
    });
  });

  describe('sendMissionToRover - Error Cases', () => {
    it('handles network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network connection failed'));

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
      expect(result.message).toContain('Network connection failed');
      expect(result.id).toBe(TEST_MISSION_ID);
    });

    it('handles timeout', async () => {
      // Mock AbortError (fetch timeout)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('timeout');
      expect(result.id).toBe(TEST_MISSION_ID);
    });

    it('handles 400 Bad Request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid JSON data',
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('400');
      expect(result.message).toContain('Invalid JSON data');
    });

    it('handles 500 Internal Server Error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Rover driver crashed',
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('500');
    });

    it('handles rover server returning error status', async () => {
      const mockResponse = {
        status: 'error',
        error: 'Queue is full',
        added: 0,
        instructions: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Queue is full');
      expect(result.rawResponse).toEqual(mockResponse);
    });

    it('handles response with no instructions', async () => {
      const mockResponse = {
        status: 'ok',
        added: 0,
        instructions: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('did not return queued instruction');
    });
  });

  describe('sendMissionToRover - Validation', () => {
    it('rejects invalid IP address', async () => {
      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover('', TEST_PORT, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid rover IP');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid port (too high)', async () => {
      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, 99999, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid rover port');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid port (zero)', async () => {
      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMissionToRover(TEST_IP, 0, payload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid rover port');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid payload (missing code)', async () => {
      const invalidPayload = {
        cmd: 'run_python' as const,
        params: {
          code: '',
          id: TEST_MISSION_ID,
        },
      };

      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, invalidPayload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid payload');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid payload (missing id)', async () => {
      const invalidPayload = {
        cmd: 'run_python' as const,
        params: {
          code: TEST_CODE,
          id: '',
        },
      };

      const result = await client.sendMissionToRover(TEST_IP, TEST_PORT, invalidPayload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid payload');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('sendMission (convenience method)', () => {
    it('sends mission using RoverConfig object', async () => {
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-uuid',
            cmd: 'run_python',
            params: { code: TEST_CODE, id: TEST_MISSION_ID },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const config = { ip: TEST_IP, port: TEST_PORT };
      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      const result = await client.sendMission(config, payload);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://${TEST_IP}:${TEST_PORT}/queue/add`,
        expect.any(Object)
      );
    });
  });

  describe('Payload Structure Verification', () => {
    it('sends exactly the minimal payload structure (no extra fields)', async () => {
      const mockResponse = {
        status: 'ok',
        added: 1,
        instructions: [
          {
            id: 'rover-uuid',
            cmd: 'run_python',
            params: { code: TEST_CODE, id: TEST_MISSION_ID },
            timestamp: '2026-05-13T12:00:00.000Z',
            status: 'pending',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const payload = createRoverPayload(TEST_CODE, TEST_MISSION_ID);
      await client.sendMissionToRover(TEST_IP, TEST_PORT, payload);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const sentBody = JSON.parse(fetchCall[1].body);
      const sentPayload = sentBody[0];

      // Verify exactly 3 top-level keys: apiVersion, cmd and params (API v1 contract)
      expect(Object.keys(sentPayload)).toHaveLength(3);
      expect(sentPayload).toHaveProperty('apiVersion', 'v1');
      expect(sentPayload).toHaveProperty('cmd');
      expect(sentPayload).toHaveProperty('params');

      // Verify params has exactly 2 keys: code and id
      expect(Object.keys(sentPayload.params)).toHaveLength(2);
      expect(sentPayload.params).toHaveProperty('code');
      expect(sentPayload.params).toHaveProperty('id');

      // Verify no extra fields
      expect(sentPayload).not.toHaveProperty('timestamp');
      expect(sentPayload).not.toHaveProperty('status');
      expect(sentPayload).not.toHaveProperty('metadata');
      expect(sentPayload.params).not.toHaveProperty('missionId');
      expect(sentPayload.params).not.toHaveProperty('submittedAt');
    });
  });
});
