/**
 * Learner Statistics API
 *
 * GET /api/learner/stats?sessionId=xxx - Get learner mission statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { FirestoreLearnerRepository } from '@/infrastructure/persistence/FirestoreLearnerRepository';

const learnerRepo = new FirestoreLearnerRepository();

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const stats = await learnerRepo.getStatistics(sessionId);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Failed to get learner stats:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve statistics' },
      { status: 500 }
    );
  }
}
