/**
 * PATCH /api/operator/missions/[missionId] — Admin-only mission actions
 *
 * Actions: add-youtube-url | mark-complete | cancel | mark-failed.
 * Requires operator authentication (unauthenticated requests get 401).
 *
 * Note: the execute/dispatch action from the old mission-control app (and its
 * rover-config / GroundStationDispatch dependencies) is intentionally dropped —
 * the yard runs missions directly, so the hub only records outcomes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

type OperatorMissionRouteContext = {
  params: Promise<{ missionId: string }>;
};

const ACTIONS = ['add-youtube-url', 'mark-complete', 'cancel', 'mark-failed'] as const;

// Accepts standard watch URLs and short youtu.be links.
const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
];

export async function PATCH(request: NextRequest, context: OperatorMissionRouteContext) {
  const { missionId } = await context.params;

  try {
    await verifyOperatorAuth(request);

    const body = await request.json();
    const { action } = body;

    if (!action || !ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const missionRepository = new FirestoreMissionRepository(getFirestoreInstance());
    const mission = await missionRepository.findById(missionId);

    if (!mission) {
      return NextResponse.json({ success: false, error: 'Mission not found' }, { status: 404 });
    }

    if (action === 'mark-complete') {
      await missionRepository.update(missionId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        { success: true, message: 'Mission marked complete', missionId },
        { status: 200 }
      );
    }

    if (action === 'cancel') {
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
        { success: true, message: 'Mission cancelled', missionId },
        { status: 200 }
      );
    }

    if (action === 'mark-failed') {
      await missionRepository.update(missionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        executionResult: {
          isSuccessful: false,
          consoleOutput: '',
          errorMessage: 'Mission marked as failed by operator',
        },
      });
      return NextResponse.json(
        { success: true, message: 'Mission marked as failed', missionId },
        { status: 200 }
      );
    }

    if (action === 'add-youtube-url') {
      const { youtubeUrl } = body;

      if (!youtubeUrl || typeof youtubeUrl !== 'string' || !youtubeUrl.trim()) {
        return NextResponse.json(
          { success: false, error: 'YouTube URL is required' },
          { status: 400 }
        );
      }

      const isValidYoutubeUrl = YOUTUBE_URL_PATTERNS.some((pattern) =>
        pattern.test(youtubeUrl.trim())
      );

      if (!isValidYoutubeUrl) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Invalid YouTube URL format. Please use: https://youtube.com/watch?v=... or https://youtu.be/...',
          },
          { status: 400 }
        );
      }

      // A video only exists once a run has completed.
      if (mission.status !== 'completed') {
        return NextResponse.json(
          { success: false, error: 'YouTube URL can only be added to completed missions' },
          { status: 400 }
        );
      }

      await missionRepository.update(missionId, { youtubeUrl: youtubeUrl.trim() });
      return NextResponse.json(
        { success: true, message: 'YouTube video added successfully', missionId },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Mission action error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
