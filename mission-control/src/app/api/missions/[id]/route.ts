/**
 * PATCH /api/missions/[id] - mission status updates (Task 61).
 *
 * Used by the operator console and execution agent to move a mission through
 * queued -> processing -> completed/failed/cancelled. When the update
 * includes a status change, this route best-effort emails the learner via
 * MissionNotificationService - a Resend failure never fails the update itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateMissionSchema } from '@/infrastructure/validation/schemas';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionService } from '@/core/application/services/MissionService';
import { MissionNotificationService } from '@/core/application/services/MissionNotificationService';
import { ResendEmailSender } from '@/infrastructure/email/resend-client';

export async function PATCH(
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
      { status: 500 }
    );
  }

  const validation = updateMissionSchema.safeParse(body);
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

    const updatedMission = await service.updateMission(id, validation.data);

    if (!updatedMission) {
      return NextResponse.json(
        { success: false, error: 'Mission not found' },
        { status: 404 }
      );
    }

    if (validation.data.status) {
      const historyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/history`;
      const notificationService = new MissionNotificationService(
        new ResendEmailSender(),
        firestore,
        historyUrl
      );

      await notificationService.notifyStatusChange(updatedMission, validation.data.status);
    }

    return NextResponse.json({ success: true, mission: updatedMission }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
