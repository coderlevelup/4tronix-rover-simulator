import type { Mission, MissionStatus } from '@/core/domain/entities/Mission';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'no-reply@4tronix.org';

async function sendRawEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not configured; email was skipped.');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error: ${response.status} ${text}`);
  }
}

const STATUS_CONFIG: Record<MissionStatus, { emoji: string; heading: string; description: string } | null> = {
  queued: {
    emoji: '📋',
    heading: 'Mission Queued',
    description: 'Your mission has been submitted and is waiting in the queue to be executed.',
  },
  processing: {
    emoji: '🚀',
    heading: 'Mission In Progress',
    description: 'Your rover is now executing your mission code!',
  },
  completed: {
    emoji: '✅',
    heading: 'Mission Complete',
    description: 'Your rover mission has been successfully executed.',
  },
  failed: {
    emoji: '❌',
    heading: 'Mission Failed',
    description: 'Unfortunately, your mission encountered an error during execution.',
  },
  cancelled: null,
};

function buildStatusEmailHtml(mission: Mission, status: MissionStatus): string {
  const config = STATUS_CONFIG[status];
  if (!config) return '';

  const missionLink = `${APP_URL}/?missionId=${encodeURIComponent(mission.id)}`;
  const missionName = mission.name || mission.id;

  let details = '';

  if (status === 'queued' && mission.queuePosition != null) {
    details = `<p>Queue position: <strong>#${mission.queuePosition}</strong></p>`;
  }

  if (status === 'completed') {
    if (mission.youtubeUrl) {
      details += `<p>Watch the video: <a href="${mission.youtubeUrl}">${mission.youtubeUrl}</a></p>`;
    }
    if (mission.executionMetadata?.duration_ms) {
      const seconds = (mission.executionMetadata.duration_ms / 1000).toFixed(1);
      details += `<p>Execution time: ${seconds}s</p>`;
    }
  }

  if (status === 'failed' && mission.executionResult?.errorMessage) {
    details = `<p>Error: <code>${mission.executionResult.errorMessage}</code></p>`;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px;">${config.emoji} ${config.heading}</h2>
      <p style="color: #666; margin: 0 0 16px;">Mission: <strong>${missionName}</strong></p>
      <p>${config.description}</p>
      ${details}
      <p style="margin-top: 24px;">
        <a href="${missionLink}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">View Mission</a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">Rover Simulator &mdash; 4tronix</p>
    </div>
  `;
}

export async function sendMissionStatusEmail(mission: Mission, status: MissionStatus): Promise<void> {
  if (!mission.learnerEmail) return;

  const config = STATUS_CONFIG[status];
  if (!config) return;

  const missionName = mission.name || mission.id;
  const subject = `${config.emoji} ${config.heading} - ${missionName}`;
  const html = buildStatusEmailHtml(mission, status);

  await sendRawEmail(mission.learnerEmail, subject, html);
}

export async function sendMissionCompletedEmail(mission: Mission): Promise<void> {
  await sendMissionStatusEmail(mission, 'completed');
}

export default { sendMissionStatusEmail, sendMissionCompletedEmail };
