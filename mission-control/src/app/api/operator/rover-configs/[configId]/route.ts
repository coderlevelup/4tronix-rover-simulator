import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { RoverConfigService } from '@/core/application/services/RoverConfigService';
import { updateRoverConfigSchema } from '@/infrastructure/validation/roverConfigValidation';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const userId = await verifyOperatorAuth(request);
    const { configId } = await params;

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);

    const config = await repository.findByIdAndUserId(configId, userId);

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Config not found' },
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const userId = await verifyOperatorAuth(request);
    const { configId } = await params;
    const body = await request.json();

    const validated = updateRoverConfigSchema.parse(body);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const result = await service.updateConfig(userId, configId, validated);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const userId = await verifyOperatorAuth(request);
    const { configId } = await params;

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const result = await service.deleteConfig(userId, configId);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
