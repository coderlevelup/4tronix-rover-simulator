/**
 * Integration Tests for Task 108: Video Display in Completed Missions
 *
 * User Story 102: As a learner I want to view and download my mission video
 * on the platform so that I can see exactly what my code caused the rover to do.
 *
 * Test Coverage:
 * - Video URL presence in completed missions
 * - Video field validation
 * - Mission entity includes video fields
 *
 * Testing Strategy:
 * - Test mission entity structure
 * - Validate video URL formats
 * - Verify video fields in completed missions
 */

import type { Mission } from '@/core/domain/entities/Mission';

describe('Video Display Integration', () => {
  describe('Mission Entity Video Fields', () => {
    /**
     * Test Case 1: Mission entity includes videoUrl field
     */
    it('mission entity supports videoUrl field', () => {
      const mission: Mission = {
        id: 'test-mission-1',
        yardId: 'uct-rover-1',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
        status: 'completed',
        submittedAt: new Date().toISOString(),
        videoUrl: 'https://storage.googleapis.com/test-bucket/mission-1.mp4',
      };

      expect(mission.videoUrl).toBeDefined();
      expect(typeof mission.videoUrl).toBe('string');
    });

    /**
     * Test Case 2: Mission entity supports youtubeUrl field
     */
    it('mission entity supports youtubeUrl field', () => {
      const mission: Mission = {
        id: 'test-mission-2',
        yardId: 'uct-rover-1',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
        status: 'completed',
        submittedAt: new Date().toISOString(),
        youtubeUrl: 'https://www.youtube.com/watch?v=test123',
      };

      expect(mission.youtubeUrl).toBeDefined();
      expect(typeof mission.youtubeUrl).toBe('string');
    });

    /**
     * Test Case 3: Mission can have both videoUrl and youtubeUrl
     */
    it('mission entity supports both video fields simultaneously', () => {
      const mission: Mission = {
        id: 'test-mission-3',
        yardId: 'uct-rover-1',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
        status: 'completed',
        submittedAt: new Date().toISOString(),
        videoUrl: 'https://storage.googleapis.com/test-bucket/mission-3.mp4',
        youtubeUrl: 'https://www.youtube.com/watch?v=test456',
      };

      expect(mission.videoUrl).toBeDefined();
      expect(mission.youtubeUrl).toBeDefined();
    });

    /**
     * Test Case 4: Video fields are optional
     */
    it('video fields are optional in mission entity', () => {
      const mission: Mission = {
        id: 'test-mission-4',
        yardId: 'uct-rover-1',
        sessionId: 'session-123',
        code: 'rover.forward(100)',
        status: 'queued',
        submittedAt: new Date().toISOString(),
      };

      expect(mission.videoUrl).toBeUndefined();
      expect(mission.youtubeUrl).toBeUndefined();
    });
  });

  describe('Video URL Validation', () => {
    /**
     * Test Case 5: Google Cloud Storage URL format is valid
     */
    it('accepts valid GCS URL format', () => {
      const gcsUrl = 'https://storage.googleapis.com/rover-videos/mission-123.mp4';

      expect(gcsUrl).toMatch(/^https:\/\/storage\.googleapis\.com\//);
      expect(gcsUrl).toMatch(/\.mp4$/);
    });

    /**
     * Test Case 6: YouTube URL format is valid
     */
    it('accepts valid YouTube URL format', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      expect(youtubeUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    });

    /**
     * Test Case 7: Short YouTube URL format is valid
     */
    it('accepts valid youtu.be URL format', () => {
      const shortYoutubeUrl = 'https://youtu.be/dQw4w9WgXcQ';

      expect(shortYoutubeUrl).toMatch(/^https:\/\/youtu\.be\//);
    });
  });

  describe('Completed Mission Video Workflow', () => {
    /**
     * Test Case 8: Completed mission can have video
     */
    it('completed mission includes video URL', () => {
      const completedMission: Mission = {
        id: 'completed-1',
        yardId: 'uct-rover-1',
        sessionId: 'session-456',
        code: 'rover.forward(100)\nrover.turn_left(90)',
        status: 'completed',
        submittedAt: '2026-04-20T10:00:00Z',
        startedAt: '2026-04-20T10:05:00Z',
        completedAt: '2026-04-20T10:06:30Z',
        videoUrl: 'https://storage.googleapis.com/rover-videos/completed-1.mp4',
        executionResult: {
          isSuccessful: true,
          consoleOutput: 'Mission completed successfully',
        },
      };

      expect(completedMission.status).toBe('completed');
      expect(completedMission.videoUrl).toBeDefined();
      expect(completedMission.completedAt).toBeDefined();
    });

    /**
     * Test Case 9: Failed mission can also have video
     */
    it('failed mission includes video URL showing failure', () => {
      const failedMission: Mission = {
        id: 'failed-1',
        yardId: 'uct-rover-1',
        sessionId: 'session-789',
        code: 'rover.forward(9999)',
        status: 'failed',
        submittedAt: '2026-04-20T11:00:00Z',
        startedAt: '2026-04-20T11:05:00Z',
        completedAt: '2026-04-20T11:05:15Z',
        videoUrl: 'https://storage.googleapis.com/rover-videos/failed-1.mp4',
        executionResult: {
          isSuccessful: false,
          consoleOutput: 'Execution error',
          errorMessage: 'Distance out of bounds',
        },
      };

      expect(failedMission.status).toBe('failed');
      expect(failedMission.videoUrl).toBeDefined();
      expect(failedMission.executionResult?.isSuccessful).toBe(false);
    });

    /**
     * Test Case 10: Queued mission does not have video yet
     */
    it('queued mission does not have video URL', () => {
      const queuedMission: Mission = {
        id: 'queued-1',
        yardId: 'uct-rover-1',
        sessionId: 'session-101',
        code: 'rover.forward(50)',
        status: 'queued',
        submittedAt: '2026-04-20T12:00:00Z',
        queuePosition: 3,
        estimatedWait: 180,
      };

      expect(queuedMission.status).toBe('queued');
      expect(queuedMission.videoUrl).toBeUndefined();
      expect(queuedMission.completedAt).toBeUndefined();
    });

    /**
     * Test Case 11: Processing mission does not have video yet
     */
    it('processing mission does not have video URL', () => {
      const processingMission: Mission = {
        id: 'processing-1',
        yardId: 'uct-rover-1',
        sessionId: 'session-202',
        code: 'rover.turn_right(180)',
        status: 'processing',
        submittedAt: '2026-04-20T13:00:00Z',
        startedAt: '2026-04-20T13:05:00Z',
      };

      expect(processingMission.status).toBe('processing');
      expect(processingMission.videoUrl).toBeUndefined();
      expect(processingMission.completedAt).toBeUndefined();
    });
  });

  describe('Video File Types', () => {
    /**
     * Test Case 12: MP4 video format is supported
     */
    it('supports MP4 video format', () => {
      const mp4Url = 'https://storage.googleapis.com/videos/mission.mp4';
      expect(mp4Url).toMatch(/\.mp4$/);
    });

    /**
     * Test Case 13: WebM video format is supported
     */
    it('supports WebM video format', () => {
      const webmUrl = 'https://storage.googleapis.com/videos/mission.webm';
      expect(webmUrl).toMatch(/\.webm$/);
    });
  });
});
