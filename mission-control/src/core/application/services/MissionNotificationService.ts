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

/** Log prefix so every notification attempt is greppable in server output. */
const LOG_TAG = '[mission-email]';

/**
 * Why a send did or did not happen. Returned rather than thrown so callers keep
 * their best-effort semantics, but the outcome is no longer invisible: a silent
 * catch is how the whole feature sat broken without anyone noticing.
 */
export type NotifyOutcome =
  | { sent: true }
  | { sent: false; reason: 'no-learner-email' | 'send-failed'; error?: string };

export class MissionNotificationService {
  constructor(
    private readonly emailSender: IEmailSender,
    private readonly firestore: Firestore,
    private readonly historyUrl: string
  ) {}

  async notifyStatusChange(mission: Mission, status: MissionStatus): Promise<NotifyOutcome> {
    if (!mission.learnerEmail) {
      console.warn(
        `${LOG_TAG} skipped mission=${mission.id} status=${status} reason=no-learner-email`
      );
      return { sent: false, reason: 'no-learner-email' };
    }

    try {
      const learnerName = await this.resolveLearnerName(mission.learnerId);
      const { subject, html } = buildMissionStatusEmail(status, {
        missionName: mission.name || mission.id,
        learnerName,
        historyUrl: this.historyUrl,
      });

      await this.emailSender.send(mission.learnerEmail, subject, html);

      console.info(
        `${LOG_TAG} sent mission=${mission.id} status=${status} to=${mission.learnerEmail}`
      );
      return { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${LOG_TAG} FAILED mission=${mission.id} status=${status} to=${mission.learnerEmail}: ${message}`
      );
      return { sent: false, reason: 'send-failed', error: message };
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
