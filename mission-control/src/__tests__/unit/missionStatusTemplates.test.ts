/**
 * Unit tests for mission status email templates.
 * Pure functions - no Firestore/email-provider mocking needed.
 */

import { buildMissionStatusEmail } from '@/infrastructure/email/missionStatusTemplates';
import { MissionStatus } from '@/core/domain/entities/Mission';

const HISTORY_URL = 'http://localhost:3000/history';

describe('buildMissionStatusEmail', () => {
  const statuses: MissionStatus[] = ['queued', 'processing', 'completed', 'failed', 'cancelled'];

  it.each(statuses)('includes the mission name in the subject and body for status "%s"', (status) => {
    const { subject, html } = buildMissionStatusEmail(status, {
      missionName: 'Orbital Nomad',
      learnerName: 'Ada',
      historyUrl: HISTORY_URL,
    });

    expect(subject).toContain('Orbital Nomad');
    expect(html).toContain('Orbital Nomad');
  });

  it.each(statuses)('includes the history link CTA for status "%s"', (status) => {
    const { html } = buildMissionStatusEmail(status, {
      missionName: 'Orbital Nomad',
      learnerName: 'Ada',
      historyUrl: HISTORY_URL,
    });

    expect(html).toContain(HISTORY_URL);
    expect(html).toContain('Mission Control');
  });

  it('greets the learner by name when provided', () => {
    const { html } = buildMissionStatusEmail('completed', {
      missionName: 'Orbital Nomad',
      learnerName: 'Ada',
      historyUrl: HISTORY_URL,
    });

    expect(html).toContain('Hi Ada,');
  });

  it('falls back to "Space Explorer" when no learner name is provided', () => {
    const { html } = buildMissionStatusEmail('completed', {
      missionName: 'Orbital Nomad',
      historyUrl: HISTORY_URL,
    });

    expect(html).toContain('Hi Space Explorer,');
  });

  it('falls back to "Space Explorer" when the learner name is blank', () => {
    const { html } = buildMissionStatusEmail('completed', {
      missionName: 'Orbital Nomad',
      learnerName: '   ',
      historyUrl: HISTORY_URL,
    });

    expect(html).toContain('Hi Space Explorer,');
  });

  it('produces distinct subjects per status', () => {
    const subjects = new Set(
      statuses.map(
        (status) =>
          buildMissionStatusEmail(status, {
            missionName: 'Orbital Nomad',
            historyUrl: HISTORY_URL,
          }).subject
      )
    );

    expect(subjects.size).toBe(statuses.length);
  });
});
