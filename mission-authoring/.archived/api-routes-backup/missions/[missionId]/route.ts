import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const { missionId } = await params;
    console.log(`[API] Fetching mission: ${missionId}`);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);

    const mission = await repository.findById(missionId);

    if (!mission) {
      console.log(`[API] Mission not found: ${missionId}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not found',
        },
        { status: 404 }
      );
    }

    if (mission.status !== 'completed' || (!mission.videoUrl && !mission.youtubeUrl)) {
      console.log(`[API] Mission not public: ${missionId} (status: ${mission.status}, hasVideo: ${!!(mission.videoUrl || mission.youtubeUrl)})`);
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not available in public catalogue',
        },
        { status: 404 }
      );
    }

    console.log(`[API] Returning mission: ${missionId}`);
    return NextResponse.json(
      {
        success: true,
        mission,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Public mission fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
