import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { RoverConfigService } from '@/core/application/services/RoverConfigService';
import { createRoverConfigSchema } from '@/infrastructure/validation/roverConfigValidation';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

export async function GET(request: NextRequest) {
  try {
    console.log('[GET /api/operator/rover-configs] Fetching rover configs');
    const userId = await verifyOperatorAuth(request);
    console.log('[GET /api/operator/rover-configs] User ID:', userId);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const configs = await service.getConfigs(userId);
    console.log('[GET /api/operator/rover-configs] Found configs:', configs.length);

    return NextResponse.json({ success: true, configs }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/operator/rover-configs] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[POST /api/operator/rover-configs] Creating new rover config');
    const userId = await verifyOperatorAuth(request);
    console.log('[POST /api/operator/rover-configs] User ID:', userId);

    const body = await request.json();
    console.log('[POST /api/operator/rover-configs] Request body:', body);

    const validated = createRoverConfigSchema.parse(body);
    console.log('[POST /api/operator/rover-configs] Validated data:', validated);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const result = await service.createConfig(userId, validated);
    console.log('[POST /api/operator/rover-configs] Service result:', result);

    if (!result.success) {
      console.error('[POST /api/operator/rover-configs] Failed to create config:', result.error);
      return NextResponse.json(result, { status: 400 });
    }

    console.log('[POST /api/operator/rover-configs] Config created successfully:', result.config?.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[POST /api/operator/rover-configs] Error:', error);
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
