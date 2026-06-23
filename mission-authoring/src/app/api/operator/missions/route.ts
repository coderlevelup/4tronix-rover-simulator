/**
 * GET /api/operator/missions — Operator mission list
 *
 * Protected endpoint for operators to view all submitted missions across yards.
 * Requires operator authentication (proxy.ts also guards /api/operator, so this
 * is defence-in-depth): unauthenticated requests get 401.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { verifyOperatorAuth } from '@/infrastructure/auth/operator-claims';

export async function GET(request: NextRequest) {
  try {
    await verifyOperatorAuth(request);

    const repository = new FirestoreMissionRepository(getFirestoreInstance());
    const missions = await repository.findAll();

    return NextResponse.json({ success: true, missions }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Operator missions fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
