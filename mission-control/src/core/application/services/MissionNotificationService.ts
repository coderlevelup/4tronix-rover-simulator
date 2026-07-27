/**
 * Mission Notification Service
 *
 * Sends a status-change email to the learner when their mission's status
 * updates. Best-effort: an email-provider failure or missing learner email
 * must never fail the mission write it's reacting to, so every failure is
 * caught and logged rather than propagated.
 */

import { Firestore } from 'firebase-admin/firestore';
import { Mission, MissionStatus } from '@/core/domain/entities/Mission';
import { IEmailSender } from '@/core/domain/services/IEmailSender';
import { buildMissionStatusEmail } from '@/infrastructure/email/missionStatusTemplates';

const LEARNERS_COLLECTION = 'learners';

export class MissionNotificationService {
  constructor(
    private readonly emailSender: IEmailSender,
    private readonly firestore: Firestore,
    private readonly historyUrl: string
  ) {}

  async notifyStatusChange(mission: Mission, status: MissionStatus): Promise<void> {
    if (!mission.learnerEmail) {
      return;
    }

    try {
      const learnerName = await this.resolveLearnerName(mission.learnerId);
      const { subject, html } = buildMissionStatusEmail(status, {
        missionName: mission.name || mission.id,
        learnerName,
        historyUrl: this.historyUrl,
      });

      await this.emailSender.send(mission.learnerEmail, subject, html);
    } catch (error) {
      console.error(`Failed to send mission status email for mission ${mission.id}:`, error);
    }
  }

  private async resolveLearnerName(learnerId: string): Promise<string | undefined> {
    const snapshot = await this.firestore.collection(LEARNERS_COLLECTION).doc(learnerId).get();

    if (!snapshot.exists) {
      return undefined;
    }

    const data = snapshot.data();
    return (data?.displayName as string) || undefined;
  }
}
