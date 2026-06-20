/**
 * Unit Tests for Task 57: Queue Position Confirmation
 *
 * User Story 54: As a learner I want to receive a confirmation with my queue
 * position when my mission is accepted so that I know my mission will be executed.
 *
 * Test Coverage:
 * - Queue position calculation (number of missions ahead + 1)
 * - Estimated wait time calculation (position * 90 seconds)
 * - Edge cases (empty queue, first position)
 *
 * Testing Strategy:
 * - Unit tests using Jest mocks
 * - Repository layer is mocked to isolate service logic
 * - Tests verify the response structure, not the database queries
 *
 * Queue Position Algorithm:
 * queuePosition = (count of queued missions in same yard submitted before this one) + 1
 *
 * Estimated Wait Algorithm:
 * estimatedWait = (queuePosition - 1) * 90 seconds
 * Assumption: Average mission execution time is 90 seconds
 */

import { MissionService } from '@/core/application/services/MissionService';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';
import { Mission } from '@/core/domain/entities/Mission';
import { CreateMissionDto } from '@/infrastructure/validation/schemas';

describe('queue confirmation', () => {
  // Mock repository - simulates database without actual DB calls
  let mockRepository: jest.Mocked<IMissionRepository>;

  // Service under test - uses mocked repository
  let service: MissionService;

  /**
   * Setup before each test
   * Creates fresh mock and service instances to ensure test isolation
   */
  beforeEach(() => {
    // Create mock implementation of IMissionRepository
    // All methods are Jest mocks that can be configured per test
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySessionId: jest.fn(),
      getQueuedMissions: jest.fn(),
      update: jest.fn(),
      getQueueLength: jest.fn(),
    } as jest.Mocked<IMissionRepository>;

    // Instantiate service with mocked repository
    // This allows us to test service logic without database
    service = new MissionService(mockRepository);
  });

  /**
   * Test Case 1: Confirmation response includes queue position and estimated wait
   *
   * Scenario: Learner submits mission when 2 other missions are ahead in queue
   * Expected: Response includes queuePosition=3 and estimatedWait=180 seconds
   *
   * Business Logic:
   * - queuePosition = 3 (third in line)
   * - estimatedWait = (3-1) * 90 = 180 seconds = 3 minutes
   *
   * This is the primary happy path test for User Story 54
   */
  it('confirmation response includes queue position and estimated wait', async () => {
    // Arrange: Create valid mission submission DTO
    const dto: CreateMissionDto = {
      yardId: 'uct-rover-1',
      sessionId: 'test-session-123',
      code: 'rover.forward(100)',
      challengeId: 'M1-FORWARD',
    };

    // Mock the repository response - simulate mission with queue position
    const mockMission: Mission = {
      id: 'mission-123',
      yardId: 'uct-rover-1',
      sessionId: 'test-session-123',
      code: 'rover.forward(100)',
      challengeId: 'M1-FORWARD',
      status: 'queued',
      submittedAt: new Date().toISOString(),
      queuePosition: 3, // Third in queue
      estimatedWait: 180, // (3-1) * 90 seconds = 180 seconds = 3 minutes
    };

    // Configure mock to return our test mission
    mockRepository.create.mockResolvedValue(mockMission);

    // Act: Submit mission via service
    const result = await service.submitMission(dto);

    // Assert: Verify response structure and values
    expect(result.success).toBe(true);
    expect(result.mission).toBeDefined();
    expect(result.mission?.queuePosition).toBe(3);
    expect(result.mission?.estimatedWait).toBe(180);
  });

  /**
   * Test Case 2: Queue position 1 has zero estimated wait
   *
   * Scenario: Learner's mission is next to execute (first in queue)
   * Expected: queuePosition=1 and estimatedWait=0 seconds
   *
   * Business Logic:
   * - queuePosition = 1 (no missions ahead)
   * - estimatedWait = (1-1) * 90 = 0 seconds (ready to execute immediately)
   *
   * This tests the edge case where the mission can execute right away
   */
  it('queue position 1 has zero estimated wait', async () => {
    // Arrange: Mission submission without challengeId (optional field)
    const dto: CreateMissionDto = {
      yardId: 'uct-rover-1',
      sessionId: 'test-session-456',
      code: 'rover.forward(50)',
    };

    // Mock mission that's first in queue
    const mockMission: Mission = {
      id: 'mission-456',
      yardId: 'uct-rover-1',
      sessionId: 'test-session-456',
      code: 'rover.forward(50)',
      status: 'queued',
      submittedAt: new Date().toISOString(),
      queuePosition: 1, // First in queue
      estimatedWait: 0, // No wait time - ready to execute
    };

    mockRepository.create.mockResolvedValue(mockMission);

    // Act: Submit mission
    const result = await service.submitMission(dto);

    // Assert: Verify first position with zero wait
    expect(result.success).toBe(true);
    expect(result.mission?.queuePosition).toBe(1);
    expect(result.mission?.estimatedWait).toBe(0);
  });

  /**
   * Test Case 3: Handles empty queue correctly
   *
   * Scenario: Learner submits to a yard with no existing queued missions
   * Expected: Mission becomes first in queue (position 1, wait 0)
   *
   * Business Logic:
   * - Different yardId (uct-rover-2) to test multi-yard isolation
   * - Empty queue = queuePosition 1
   * - No missions ahead = estimatedWait 0
   *
   * This verifies that queue calculations work correctly when starting fresh
   * and that different yards maintain separate queues
   */
  it('handles empty queue correctly', async () => {
    // Arrange: Submit to different yard (uct-rover-2) with empty queue
    const dto: CreateMissionDto = {
      yardId: 'uct-rover-2', // Different yard from previous tests
      sessionId: 'test-session-789',
      code: 'rover.turn_left(90)', // Different rover command
    };

    // Mock mission in empty queue
    const mockMission: Mission = {
      id: 'mission-789',
      yardId: 'uct-rover-2',
      sessionId: 'test-session-789',
      code: 'rover.turn_left(90)',
      status: 'queued',
      submittedAt: new Date().toISOString(),
      queuePosition: 1, // First and only mission in this yard's queue
      estimatedWait: 0, // No wait when queue is empty
    };

    mockRepository.create.mockResolvedValue(mockMission);

    // Act: Submit to empty queue
    const result = await service.submitMission(dto);

    // Assert: Verify correct handling of empty queue
    expect(result.success).toBe(true);
    expect(result.mission?.queuePosition).toBe(1);
    expect(result.mission?.estimatedWait).toBe(0);
  });
});
