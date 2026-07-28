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

/** What the learner record contributes: where to send, and who to greet. */
type LearnerContact = {
  email?: string;
  displayName?: string;
};

export class MissionNotificationService {
  constructor(
    private readonly emailSender: IEmailSender,
    private readonly firestore: Firestore,
    private readonly historyUrl: string
  ) {}

  async notifyStatusChange(mission: Mission, status: MissionStatus): Promise<NotifyOutcome> {
    let learner: LearnerContact;

    try {
      learner = await this.resolveLearner(mission.learnerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${LOG_TAG} FAILED mission=${mission.id} status=${status}: could not read learner ${mission.learnerId}: ${message}`
      );
      return { sent: false, reason: 'send-failed', error: message };
    }

    // The address is deliberately NOT on the mission document - mission docs are
    // world-readable - so no learner record means no way to reach them.
    if (!learner.email) {
      console.warn(
        `${LOG_TAG} skipped mission=${mission.id} status=${status} reason=no-learner-email learner=${mission.learnerId}`
      );
      return { sent: false, reason: 'no-learner-email' };
    }

    try {
      const { subject, html } = buildMissionStatusEmail(status, {
        missionName: mission.name || mission.id,
        learnerName: learner.displayName,
        historyUrl: this.historyUrl,
      });

      await this.emailSender.send(learner.email, subject, html);

      console.info(`${LOG_TAG} sent mission=${mission.id} status=${status} to=${learner.email}`);
      return { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${LOG_TAG} FAILED mission=${mission.id} status=${status} to=${learner.email}: ${message}`
      );
      return { sent: false, reason: 'send-failed', error: message };
    }
  }

  /**
   * Address and display name both come from learners/{learnerId}, keyed by the
   * same id the mission carries.
   *
   * Previously the name was read from here while the address came off the
   * mission, and the learner record was written under a DIFFERENT id
   * (getOrCreateSession's sessionId, not getLearnerID's learnerId) - so this
   * lookup never hit and every email greeted "Space Explorer". Moving the
   * address here forces the two ids to agree, which fixes the greeting as a
   * side effect.
   */
  private async resolveLearner(learnerId: string): Promise<LearnerContact> {
    const snapshot = await this.firestore.collection(LEARNERS_COLLECTION).doc(learnerId).get();

    if (!snapshot.exists) {
      return {};
    }

    const data = snapshot.data();

    return {
      email: (data?.learnerEmail as string) || undefined,
      displayName: (data?.displayName as string) || undefined,
    };
  }
}
