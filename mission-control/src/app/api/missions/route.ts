/**
 * POST /api/missions - server-side mission submission (Tasks 40 & 41).
 *
 * Validates the payload (schema + command allowlist) before persisting, so
 * submission can be trusted even if it bypasses the client UI. The client may
 * still submit directly via the repository, but this endpoint is the safe path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMission } from '@/infrastructure/validation/schemas';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionService } from '@/core/application/services/MissionService';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 500 }
    );
  }

  // Phase 1 + 2: schema and command-allowlist validation
  const validation = validateMission(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', details: validation.errors ?? [] },
      { status: 400 }
    );
  }

  try {
    const repository = new FirestoreMissionRepository(getFirestoreInstance());
    const service = new MissionService(repository);
    const result = await service.submitMission(validation.data);

    if (!result.success || !result.mission) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Failed to submit mission' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, mission: result.mission }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
