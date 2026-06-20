import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionService } from '@/core/application/services/MissionService';
import { validateMission } from '@/infrastructure/validation/schemas';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = validateMission(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.errors?.[0] || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);
    const service = new MissionService(repository);

    const result = await service.submitMission(validation.data!);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to submit mission',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        mission: result.mission,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API] Mission submission error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
