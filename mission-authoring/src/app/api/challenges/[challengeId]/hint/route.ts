import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreChallengeRepository } from '@/infrastructure/persistence/FirestoreChallengeRepository';
import { FirestoreLearnerRepository } from '@/infrastructure/persistence/FirestoreLearnerRepository';

const getHintSchema = z.object({
  learnerId: z.string().min(1, 'Learner ID required'),
  hintLevel: z.number().int().min(1).max(3),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ challengeId?: string }> }) {
  try {
    const { challengeId } = await params;
    if (!challengeId) {
      return NextResponse.json({ success: false, error: 'Challenge ID required' }, { status: 400 });
    }

    const body = await request.json();
    const validation = getHintSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Invalid request', details: validation.error.errors }, { status: 400 });
    }

    const payload = validation.data;

    const db = getFirestoreClient();
    const challengeRepository = new FirestoreChallengeRepository(db);

    const challenge = await challengeRepository.getById(challengeId);
    if (!challenge) {
      return NextResponse.json({ success: false, error: 'Challenge not found' }, { status: 404 });
    }

    const hint = challenge.hints.find((h) => h.level === payload.hintLevel);
    if (!hint) {
      return NextResponse.json({ success: false, error: 'Hint not available at that level' }, { status: 400 });
    }

    const learnerRepository = new FirestoreLearnerRepository(db);
    await learnerRepository.recordHintUsage(payload.learnerId, challengeId, payload.hintLevel);

    return NextResponse.json({ success: true, hint: hint.text, level: hint.level, message: `Hint ${payload.hintLevel}/3 revealed` });
  } catch (error) {
    console.error('❌ Hint retrieval error:', error);
    return NextResponse.json({ success: false, error: 'Server error retrieving hint' }, { status: 500 });
  }
}
