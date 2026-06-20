import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreLearnerRepository } from '@/infrastructure/persistence/FirestoreLearnerRepository';
import { FirestoreChallengeRepository } from '@/infrastructure/persistence/FirestoreChallengeRepository';
import { ChallengeSubmissionService } from '@/core/application/services/ChallengeSubmissionService';

const submitChallengeSchema = z.object({
  learnerId: z.string().min(1, 'Learner ID required'),
  challengeId: z.string().min(1, 'Challenge ID required'),
  simulatorOutput: z.object({
    success: z.boolean(),
    shapes: z.array(z.any()),
    consoleOutput: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  hintsUsed: z.number().int().min(0).max(3).default(0),
});

type SubmitChallengeRequest = z.infer<typeof submitChallengeSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = submitChallengeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Invalid request', details: validation.error.errors }, { status: 400 });
    }

    const payload = validation.data as SubmitChallengeRequest;

    const db = getFirestoreClient();
    const learnerRepository = new FirestoreLearnerRepository(db);
    const challengeRepository = new FirestoreChallengeRepository(db);

    const submissionService = new ChallengeSubmissionService(learnerRepository, challengeRepository);

    const result = await submissionService.submitChallenge({
      learnerId: payload.learnerId,
      challengeId: payload.challengeId,
      simulatorOutput: payload.simulatorOutput,
      hintsUsed: payload.hintsUsed,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('❌ Challenge submission error:', error);
    return NextResponse.json({ success: false, error: 'Server error during challenge submission', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
