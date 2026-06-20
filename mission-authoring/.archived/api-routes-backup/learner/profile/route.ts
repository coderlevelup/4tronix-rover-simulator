/**
 * Learner Profile API
 *
 * GET /api/learner/profile?sessionId=xxx - Get learner profile
 * PATCH /api/learner/profile - Update learner profile
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

    const learner = await learnerRepo.findBySessionId(sessionId);

    if (!learner) {
      return NextResponse.json(
        { error: 'Learner not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ learner });
  } catch (error) {
    console.error('Failed to get learner profile:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve learner profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, updates } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Validate updates - only allow safe fields
    const allowedUpdates: Partial<any> = {};
    if (updates.displayName !== undefined) {
      allowedUpdates.displayName = updates.displayName;
    }

    await learnerRepo.update(sessionId, allowedUpdates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update learner profile:', error);
    return NextResponse.json(
      { error: 'Failed to update learner profile' },
      { status: 500 }
    );
  }
}
