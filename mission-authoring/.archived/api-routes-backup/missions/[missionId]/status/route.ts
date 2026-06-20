/**
 * GET /api/missions/[missionId]/status - Mission Status Polling Endpoint (Task 56)
 *
 * User Story 54: Queue Position Confirmation
 * Allows learners to poll mission status with live queue position.
 * Returns current status, queue position, and estimated wait time.
 *
 * Usage Pattern:
 * 1. Learner submits mission via POST /api/missions
 * 2. Frontend polls this endpoint every 3 seconds
 * 3. Queue position updates as missions ahead complete
 * 4. Polling stops when mission reaches terminal state (completed/failed/cancelled)
 *
 * Success Response (200):
 * {
 *   "success": true,
 *   "mission": {
 *     "id": "abc123",
 *     "status": "queued",
 *     "queuePosition": 3,
 *     "estimatedWait": 180,  // seconds
 *     "yardId": "uct-rover-1",
 *     ...
 *   }
 * }
 *
 * Not Found Response (404):
 * {
 *   "success": false,
 *   "error": "Mission not found"
 * }
 *
 * Error Response (500):
 * {
 *   "success": false,
 *   "error": "Internal server error"
 * }
 */

import { NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionStatusService } from '@/core/application/services/MissionStatusService';

/**
 * Next.js 16 dynamic route context type
 * Params are async in App Router for streaming support
 */
type MissionStatusRouteContext = {
  params: Promise<{
    missionId: string;
  }>;
};

/**
 * GET handler for mission status polling
 * @param _request - Request object (unused, but required by Next.js signature)
 * @param context - Route context containing missionId from URL path
 * @returns JSON response with mission status or error
 */
export async function GET(_request: Request, context: MissionStatusRouteContext) {
  try {
    // Extract missionId from dynamic route params
    // Next.js 16+ requires awaiting params for async rendering
    const { missionId } = await context.params;

    // Initialize dependencies using dependency injection pattern
    // This allows for easy mocking in tests
    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);
    const service = new MissionStatusService(repository);

    // Fetch mission with live queue position calculation
    // Repository computes position by counting queued missions ahead of this one
    const mission = await service.getMissionStatus(missionId);

    // Handle mission not found (invalid ID or already deleted)
    if (!mission) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not found',
        },
        { status: 404 }
      );
    }

    // Return mission with queue position and estimated wait
    // queuePosition: number of missions ahead + 1
    // estimatedWait: (queuePosition - 1) * 90 seconds
    return NextResponse.json(
      {
        success: true,
        mission,
      },
      { status: 200 }
    );
  } catch (error) {
    // Log error for debugging (appears in Cloud Run logs)
    console.error('Mission status fetch error:', error);

    // Return generic error to client (don't expose internal details)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
