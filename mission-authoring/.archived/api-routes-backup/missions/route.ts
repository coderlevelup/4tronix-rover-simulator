import { NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

export async function GET() {
  try {
    console.log('[API] Fetching missions from Firestore...');
    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);

    const missions = await repository.findAll();
    console.log(`[API] Found ${missions.length} total missions`);

    const publicMissions = missions
      .filter((mission) => mission.status === 'completed' && (mission.videoUrl || mission.youtubeUrl))
      .sort((a, b) => {
        const aTime = new Date(a.completedAt || a.submittedAt).getTime();
        const bTime = new Date(b.completedAt || b.submittedAt).getTime();
        return bTime - aTime;
      });

    console.log(`[API] Returning ${publicMissions.length} public missions`);

    return NextResponse.json(
      {
        success: true,
        missions: publicMissions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Public missions fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
