/**
 * Unit Tests for Task 107: VideoPlayer Component
 *
 * User Story 102: As a learner I want to view and download my mission video
 * on the platform so that I can see exactly what my code caused the rover to do.
 *
 * Test Coverage:
 * - Video player rendering with GCS URLs
 * - YouTube embed rendering
 * - Component props and configuration
 * - Loading and error states
 * - No video placeholder
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { VideoPlayer } from '@/components/ui/VideoPlayer';

describe('VideoPlayer Component', () => {
  const mockMissionId = 'test-mission-123';

  beforeEach(() => {
    // Reset any mocks before each test
    jest.clearAllMocks();
  });

  describe('No Video Available', () => {
    /**
     * Test Case 1: Shows placeholder when no video URL provided
     */
    it('shows placeholder when no video URLs provided', () => {
      render(<VideoPlayer missionId={mockMissionId} />);

      expect(screen.getByText('Video not available yet')).toBeInTheDocument();
      expect(
        screen.getByText('Videos are generated after mission execution completes')
      ).toBeInTheDocument();
    });

    /**
     * Test Case 2: Shows camera icon in placeholder
     */
    it('displays camera icon in placeholder', () => {
      const { container } = render(<VideoPlayer missionId={mockMissionId} />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Direct Video Playback (GCS URL)', () => {
    /**
     * Test Case 3: Renders video element with correct source
     */
    it('renders video element with GCS URL', () => {
      const videoUrl = 'https://storage.googleapis.com/test-bucket/mission-123.mp4';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} />
      );

      const videoElement = container.querySelector('video');
      expect(videoElement).toBeInTheDocument();
      expect(videoElement).toHaveAttribute('src', videoUrl);
      expect(videoElement).toHaveAttribute('controls');
    });

    /**
     * Test Case 4: Shows mission title
     */
    it('displays custom title', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';
      const title = 'My Mission Video';

      render(
        <VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} title={title} />
      );

      expect(screen.getByText(title)).toBeInTheDocument();
    });

    /**
     * Test Case 5: Shows mission ID
     */
    it('displays mission ID', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      render(<VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} />);

      expect(screen.getByText(mockMissionId)).toBeInTheDocument();
    });

    /**
     * Test Case 6: Download button is present by default
     */
    it('shows download button by default', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      render(<VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} />);

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    /**
     * Test Case 7: Can hide download button
     */
    it('hides download button when showDownload is false', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      render(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          showDownload={false}
        />
      );

      expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    });

    /**
     * Test Case 8: Shows default title when not provided
     */
    it('uses default title "Mission Video" when title not provided', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      render(<VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} />);

      expect(screen.getByText('Mission Video')).toBeInTheDocument();
    });
  });

  describe('YouTube Embed', () => {
    /**
     * Test Case 9: Renders YouTube iframe with correct video ID
     */
    it('renders YouTube iframe with video ID from youtube.com URL', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} youtubeUrl={youtubeUrl} />
      );

      const iframe = container.querySelector('iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
    });

    /**
     * Test Case 10: Handles youtu.be short URLs
     */
    it('extracts video ID from youtu.be URL', () => {
      const youtubeUrl = 'https://youtu.be/dQw4w9WgXcQ';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} youtubeUrl={youtubeUrl} />
      );

      const iframe = container.querySelector('iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
    });

    /**
     * Test Case 11: Shows YouTube link
     */
    it('displays link to open in YouTube', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      render(<VideoPlayer missionId={mockMissionId} youtubeUrl={youtubeUrl} />);

      const link = screen.getByText('Open in YouTube →');
      expect(link).toHaveAttribute('href', youtubeUrl);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    /**
     * Test Case 12: YouTube preferred over GCS URL
     */
    it('prefers YouTube embed over direct video when both provided', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const { container } = render(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          youtubeUrl={youtubeUrl}
        />
      );

      // Should render iframe, not video element
      expect(container.querySelector('iframe')).toBeInTheDocument();
      expect(container.querySelector('video')).not.toBeInTheDocument();
    });

    /**
     * Test Case 13: Handles embed URLs
     */
    it('extracts video ID from embed URL', () => {
      const youtubeUrl = 'https://www.youtube.com/embed/testVideoId';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} youtubeUrl={youtubeUrl} />
      );

      const iframe = container.querySelector('iframe');
      expect(iframe).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/testVideoId'
      );
    });
  });

  describe('Component Props', () => {
    /**
     * Test Case 14: Applies custom className
     */
    it('applies custom className to container', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';
      const customClass = 'my-custom-class';

      const { container } = render(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          className={customClass}
        />
      );

      const playerContainer = container.firstChild as HTMLElement;
      expect(playerContainer).toHaveClass(customClass);
    });

    /**
     * Test Case 15: Accepts title prop
     */
    it('accepts and displays custom title prop', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';
      const customTitle = 'Custom Mission Title';

      render(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          title={customTitle}
        />
      );

      expect(screen.getByText(customTitle)).toBeInTheDocument();
    });

    /**
     * Test Case 16: Accepts showDownload prop
     */
    it('respects showDownload prop', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      const { rerender } = render(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          showDownload={true}
        />
      );

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();

      rerender(
        <VideoPlayer
          missionId={mockMissionId}
          videoUrl={videoUrl}
          showDownload={false}
        />
      );

      expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    /**
     * Test Case 17: Video element has correct attributes
     */
    it('video element has controls and preload metadata', () => {
      const videoUrl = 'https://storage.googleapis.com/test/video.mp4';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} videoUrl={videoUrl} />
      );

      const videoElement = container.querySelector('video');
      expect(videoElement).toHaveAttribute('controls');
      expect(videoElement).toHaveAttribute('preload', 'metadata');
    });

    /**
     * Test Case 18: YouTube iframe has correct attributes
     */
    it('YouTube iframe has allowFullScreen attribute', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=test123';

      const { container } = render(
        <VideoPlayer missionId={mockMissionId} youtubeUrl={youtubeUrl} />
      );

      const iframe = container.querySelector('iframe');
      expect(iframe).toHaveAttribute('allowFullScreen');
      expect(iframe).toHaveAttribute('title');
    });
  });
});
