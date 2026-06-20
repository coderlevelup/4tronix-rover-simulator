/**
 * GET /api/operator/missions - Operator Mission List Endpoint
 *
 * Protected endpoint for operators to view all submitted missions.
 * Requires operator authentication.
 *
 * Success Response (200):
 * {
 *   "success": true,
 *   "missions": [...]
 * }
 *
 * Error Response (401/500):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

export async function GET(request: NextRequest) {
  try {
    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);

    const missions = await repository.findAll();

    return NextResponse.json(
      {
        success: true,
        missions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Operator missions fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
