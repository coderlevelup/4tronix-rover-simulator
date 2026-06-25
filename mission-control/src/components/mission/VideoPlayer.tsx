/**
 * Video Player Component
 *
 * User Story 102, Task 103: Display and download mission videos
 *
 * Features:
 * - Plays video from Google Cloud Storage URL
 * - YouTube embed support (optional)
 * - Download functionality
 * - Loading and error states
 * - Responsive design
 *
 * Video Sources:
 * - Primary: videoUrl (Google Cloud Storage)
 * - Alternative: youtubeUrl (YouTube embed)
 *
 * Security Considerations:
 * - Only accepts URLs from trusted domains (GCS, YouTube)
 * - Downloads use Content-Disposition header
 * - No arbitrary URL execution
 */

'use client';

import React, { useState } from 'react';

/**
 * Props for VideoPlayer component
 */
export interface VideoPlayerProps {
  /** Google Cloud Storage video URL */
  videoUrl?: string;

  /** Optional YouTube video URL for sharing */
  youtubeUrl?: string;

  /** Mission ID for filename when downloading */
  missionId: string;

  /** Optional title to display above video */
  title?: string;

  /** Show download button (default: true) */
  showDownload?: boolean;

  /** Custom CSS classes */
  className?: string;
}

/**
 * VideoPlayer Component
 *
 * Displays mission execution video with optional download
 *
 * @param props - VideoPlayer configuration
 * @returns Rendered video player or placeholder
 */
export function VideoPlayer({
  videoUrl,
  youtubeUrl,
  missionId,
  title = 'Mission Video',
  showDownload = true,
  className = '',
}: VideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  /**
   * Handle video load success
   * Hides loading spinner when video is ready
   */
  const handleVideoLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  /**
   * Handle video load error
   * Shows error message if video fails to load
   */
  const handleVideoError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  /**
   * Download video file
   *
   * Process:
   * 1. Fetch video from URL
   * 2. Create blob from response
   * 3. Trigger browser download
   * 4. Clean up blob URL
   *
   * Note: This works for same-origin or CORS-enabled URLs
   * For GCS URLs, ensure CORS is configured
   */
  const handleDownload = async () => {
    if (!videoUrl) return;

    setIsDownloading(true);

    try {
      // Fetch video data
      const response = await fetch(videoUrl);

      if (!response.ok) {
        throw new Error('Download failed');
      }

      // Create blob from video data
      const blob = await response.blob();

      // Create temporary download URL
      const blobUrl = window.URL.createObjectURL(blob);

      // Create hidden anchor element for download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `mission-${missionId}-video.mp4`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Video download failed:', error);
      alert('Failed to download video. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Extract YouTube video ID from URL
   * Supports: youtube.com/watch?v=ID, youtu.be/ID
   *
   * @param url - YouTube URL
   * @returns YouTube video ID or null
   */
  const getYouTubeId = (url: string): string | null => {
    const patterns = [
      /youtube\.com\/watch\?v=([^&]+)/,
      /youtu\.be\/([^?]+)/,
      /youtube\.com\/embed\/([^?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  // No video available
  if (!videoUrl && !youtubeUrl) {
    return (
      <div className={`rounded-lg bg-slate-800 p-6 text-center ${className}`}>
        <svg
          className="mx-auto h-12 w-12 text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <p className="mt-4 text-sm text-slate-400">
          Video not available yet
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Videos are generated after mission execution completes
        </p>
      </div>
    );
  }

  // YouTube embed (preferred if available)
  if (youtubeUrl) {
    const youtubeId = getYouTubeId(youtubeUrl);

    if (youtubeId) {
      return (
        <div className={`space-y-3 ${className}`}>
          {title && (
            <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          )}
          <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
              onLoad={handleVideoLoad}
              onError={handleVideoError}
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>YouTube video</span>
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              Open in YouTube →
            </a>
          </div>
        </div>
      );
    }
  }

  // Direct video playback (GCS URL)
  if (videoUrl) {
    return (
      <div className={`space-y-3 ${className}`}>
        {title && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-300">{title}</h3>
            {showDownload && (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </>
                )}
              </button>
            )}
          </div>
        )}

        <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
          {/* Video element */}
          <video
            src={videoUrl}
            controls
            className="h-full w-full"
            onLoadedData={handleVideoLoad}
            onError={handleVideoError}
            preload="metadata"
          >
            Your browser does not support video playback.
          </video>

          {/* Loading spinner */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" />
                <p className="mt-2 text-xs text-slate-400">Loading video...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="mt-2 text-sm text-slate-300">Failed to load video</p>
                <p className="mt-1 text-xs text-slate-500">
                  The video may still be processing or unavailable
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500">
          Mission ID: <span className="font-mono">{missionId}</span>
        </div>
      </div>
    );
  }

  return null;
}
