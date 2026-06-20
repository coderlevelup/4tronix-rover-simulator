import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { RoverConfigService } from '@/core/application/services/RoverConfigService';
import { setActiveConfigSchema } from '@/infrastructure/validation/roverConfigValidation';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyOperatorAuth(request);
    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);

    const config = await repository.findActiveByUserId(userId);

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'No active config found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, config }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyOperatorAuth(request);
    const body = await request.json();

    const validated = setActiveConfigSchema.parse(body);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const result = await service.setActive(userId, validated.configId);

    if (!result.success) {
      return NextResponse.json(result, { status: result.error === 'Config not found' ? 404 : 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
