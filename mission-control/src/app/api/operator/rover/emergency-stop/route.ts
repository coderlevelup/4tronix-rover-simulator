import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

/**
 * Emergency Stop API Endpoint
 *
 * Sends emergency stop command to the active rover by:
 * 1. Getting the operator's active rover configuration
 * 2. Sending POST request to rover's /queue/clear endpoint
 * 3. Updating mission status to 'cancelled'
 */
export async function POST(request: NextRequest) {
  try {
    // Verify operator authentication
    const userId = await verifyOperatorAuth(request);

    const body = await request.json();
    const { missionId } = body;

    if (!missionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mission ID is required',
        },
        { status: 400 }
      );
    }

    const firestore = getFirestoreInstance();

    // Get active rover configuration
    const roverConfigRepository = new FirestoreRoverConfigRepository(firestore);
    const activeConfig = await roverConfigRepository.findActiveByUserId(userId);

    if (!activeConfig) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active rover configured',
        },
        { status: 400 }
      );
    }

    console.log(`[EmergencyStop] Sending emergency stop for mission ${missionId} to rover ${activeConfig.name}`);

    // Send emergency stop command to rover's /queue/clear endpoint
    const roverUrl = `http://${activeConfig.ipAddress}:${activeConfig.port}/queue/clear`;
    console.log(`[EmergencyStop] Sending to: ${roverUrl}`);

    try {
      const response = await fetch(roverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        console.error(`[EmergencyStop] Rover responded with error: ${response.status}`);
        // Continue to update mission status even if rover request fails
      } else {
        console.log(`[EmergencyStop] Rover queue cleared successfully`);
      }
    } catch (error) {
      console.error(`[EmergencyStop] Failed to reach rover:`, error);
      // Continue to update mission status even if rover is unreachable
    }

    // Update mission status to cancelled
    const missionRepository = new FirestoreMissionRepository(firestore);
    await missionRepository.update(missionId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
      executionResult: {
        isSuccessful: false,
        consoleOutput: '',
        errorMessage: 'Emergency stop triggered by operator',
      },
    });

    console.log(`[EmergencyStop] Mission ${missionId} marked as cancelled`);

    return NextResponse.json(
      {
        success: true,
        message: 'Emergency stop executed',
        missionId,
        roverName: activeConfig.name,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[EmergencyStop] Error:', error);

    // Check if it's an auth error
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute emergency stop',
      },
      { status: 500 }
    );
  }
}
