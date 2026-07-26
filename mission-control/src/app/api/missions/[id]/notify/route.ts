/**
 * POST /api/missions/[id]/notify
 *
 * Best-effort status-change email trigger for callers that update mission
 * status directly in Firestore instead of through PATCH /api/missions/[id]
 * (the yard operator console, which must keep working even if this app is
 * unreachable). This route sends the notification only - it never touches
 * persistence, since the caller has already written the new status itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionService } from '@/core/application/services/MissionService';
import { MissionNotificationService } from '@/core/application/services/MissionNotificationService';
import { ResendEmailSender } from '@/infrastructure/email/resend-client';

const notifyRequestSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const validation = notifyRequestSchema.safeParse(body);
  if (!validation.success) {
    const errors = validation.error.errors.map((err) => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });

    return NextResponse.json(
      { success: false, error: 'Validation failed', details: errors },
      { status: 400 }
    );
  }

  try {
    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);
    const service = new MissionService(repository);
    const mission = await service.getMissionById(id);

    if (!mission) {
      return NextResponse.json(
        { success: false, error: 'Mission not found' },
        { status: 404 }
      );
    }

    const historyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/history`;
    const notificationService = new MissionNotificationService(
      new ResendEmailSender(),
      firestore,
      historyUrl
    );

    await notificationService.notifyStatusChange(mission, validation.data.status);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
