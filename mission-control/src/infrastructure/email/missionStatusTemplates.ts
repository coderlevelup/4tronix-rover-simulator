/**
 * Mission Status Email Templates
 *
 * Pure functions - no I/O - so subject/body content can be unit tested
 * without mocking Firestore or an email provider. One shared HTML layout (light card,
 * bold mission name, blue CTA button) plus per-status copy.
 */

import { MissionStatus } from '@/core/domain/entities/Mission';

export interface MissionStatusEmailInput {
  missionName: string;
  learnerName?: string | null;
  historyUrl: string;
}

export interface MissionStatusEmailContent {
  subject: string;
  html: string;
}

interface StatusCopy {
  subjectPrefix: string;
  headline: (missionName: string) => string;
}

const STATUS_COPY: Record<MissionStatus, StatusCopy> = {
  queued: {
    subjectPrefix: '🛰️ Mission Queued',
    headline: (missionName) =>
      `Your mission <strong>${missionName}</strong> has been submitted and is queued for launch on the Red Planet. We'll let you know as soon as it starts executing.`,
  },
  processing: {
    subjectPrefix: '🚀 Mission Launched!',
    headline: (missionName) =>
      `Your mission <strong>${missionName}</strong> has been launched and is now executing on the rover. Stay tuned for the results!`,
  },
  completed: {
    subjectPrefix: '🎉 Mission Complete!',
    headline: (missionName) =>
      `Your mission <strong>${missionName}</strong> has been successfully launched and completed on Mars! 🚀`,
  },
  failed: {
    subjectPrefix: '⚠️ Mission Failed',
    headline: (missionName) =>
      `Your mission <strong>${missionName}</strong> hit a problem during execution and didn't complete successfully. Check the console output for details.`,
  },
  cancelled: {
    subjectPrefix: '🛑 Mission Cancelled',
    headline: (missionName) =>
      `Your mission <strong>${missionName}</strong> was cancelled before it could complete.`,
  },
};

export function buildMissionStatusEmail(
  status: MissionStatus,
  { missionName, learnerName, historyUrl }: MissionStatusEmailInput
): MissionStatusEmailContent {
  const copy = STATUS_COPY[status];
  const greetingName = learnerName?.trim() || 'Space Explorer';

  const subject = `${copy.subjectPrefix} - ${missionName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; color: #0f172a;">
      <p style="margin: 0 0 16px;">Hi ${greetingName},</p>
      <p style="margin: 0 0 16px; line-height: 1.5;">${copy.headline(missionName)}</p>
      <p style="margin: 0 0 24px; line-height: 1.5;">Track the current missions being executed here:</p>
      <a href="${historyUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 10px;">
        Mission Control 🚀
      </a>
      <p style="margin: 24px 0 0; color: #475569;">Over and out, Commander! 👨‍🚀</p>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">Rover Simulator — 4tronix 🛰️</p>
    </div>
  `.trim();

  return { subject, html };
}
