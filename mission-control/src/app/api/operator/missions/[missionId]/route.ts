import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { GroundStationDispatchService } from '@/core/application/services/GroundStationDispatchService';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

type OperatorMissionRouteContext = {
  params: Promise<{
    missionId: string;
  }>;
};

export async function GET(_request: Request, context: OperatorMissionRouteContext) {
  const { missionId } = await context.params;

  try {
    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);
    const mission = await repository.findById(missionId);

    if (!mission) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        mission,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Fetch mission error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: OperatorMissionRouteContext) {
  const { missionId } = await context.params;

  try {
    // Auth check
    const userId = await verifyOperatorAuth(request);

    // Parse request body
    const body = await request.json();
    const { action } = body;

    if (!action || !['execute', 'skip', 'cancel', 'add-youtube-url', 'mark-failed'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Must be one of: execute, skip, cancel, add-youtube-url, mark-failed',
        },
        { status: 400 }
      );
    }

    const firestore = getFirestoreInstance();
    const missionRepository = new FirestoreMissionRepository(firestore);
    const mission = await missionRepository.findById(missionId);

    if (!mission) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not found',
        },
        { status: 404 }
      );
    }

    // Handle different actions
    if (action === 'execute') {
      // Get active rover config
      const roverConfigRepository = new FirestoreRoverConfigRepository(firestore);
      const activeConfig = await roverConfigRepository.findActiveByUserId(userId);

      if (!activeConfig) {
        return NextResponse.json(
          {
            success: false,
            error: 'No active rover configured. Please set an active rover in the configuration.',
          },
          { status: 400 }
        );
      }

      // Dispatch mission to rover
      const dispatchService = new GroundStationDispatchService(missionRepository);
      await dispatchService.dispatchMission(mission, {
        ip: activeConfig.ipAddress,
        port: activeConfig.port,
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Mission dispatched successfully',
          missionId,
        },
        { status: 200 }
      );
    } else if (action === 'skip') {
      // Skip mission (mark as cancelled with skip reason)
      await missionRepository.update(missionId, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        executionResult: {
          isSuccessful: false,
          consoleOutput: '',
          errorMessage: 'Mission skipped by operator',
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Mission skipped',
          missionId,
        },
        { status: 200 }
      );
    } else if (action === 'cancel') {
      // Cancel mission
      await missionRepository.update(missionId, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        executionResult: {
          isSuccessful: false,
          consoleOutput: '',
          errorMessage: 'Mission cancelled by operator',
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Mission cancelled',
          missionId,
        },
        { status: 200 }
      );
    } else if (action === 'mark-failed') {
      // Mark mission as failed (for stuck/hung missions)
      // Only allow this action for missions in 'processing' state
      if (mission.status !== 'processing') {
        return NextResponse.json(
          {
            success: false,
            error: 'Only processing missions can be marked as failed',
          },
          { status: 400 }
        );
      }

      await missionRepository.update(missionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        executionResult: {
          isSuccessful: false,
          consoleOutput: '',
          errorMessage: 'Mission marked as failed by operator (no response from rover)',
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Mission marked as failed',
          missionId,
        },
        { status: 200 }
      );
    } else if (action === 'add-youtube-url') {
      // Validate YouTube URL format
      const YOUTUBE_URL_PATTERNS = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/youtu\.be\/[\w-]+/,
      ];

      const { youtubeUrl } = body;

      if (!youtubeUrl || typeof youtubeUrl !== 'string' || !youtubeUrl.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: 'YouTube URL is required',
          },
          { status: 400 }
        );
      }

      const isValidYoutubeUrl = YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(youtubeUrl.trim()));

      if (!isValidYoutubeUrl) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid YouTube URL format. Please use: https://youtube.com/watch?v=... or https://youtu.be/...',
          },
          { status: 400 }
        );
      }

      // Verify mission status is completed
      if (mission.status !== 'completed') {
        return NextResponse.json(
          {
            success: false,
            error: 'YouTube URL can only be added to completed missions',
          },
          { status: 400 }
        );
      }

      // Update mission with YouTube URL
      await missionRepository.update(missionId, {
        youtubeUrl: youtubeUrl.trim(),
      });

      return NextResponse.json(
        {
          success: true,
          message: 'YouTube video added successfully',
          missionId,
        },
        { status: 200 }
      );
    }

    // Should never reach here
    return NextResponse.json(
      {
        success: false,
        error: 'Unknown action',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Mission action error:', error);

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
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
