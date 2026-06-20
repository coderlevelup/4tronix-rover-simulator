/**
 * Mission Status Scaffold Component
 *
 * User Story 54: Queue Position Confirmation (Tasks 55-57)
 * Displays live mission status with auto-updating queue position.
 *
 * Features:
 * - Real-time queue position updates via polling
 * - Estimated wait time display
 * - Status color coding for visual feedback
 * - Automatic polling stop when mission completes
 *
 * Implementation Notes:
 * - 'use client' directive required for React hooks (useState, useEffect)
 * - Polls every 3 seconds while mission is active (queued/processing)
 * - Cleans up interval on component unmount to prevent memory leaks
 */
'use client';

import { ScaffoldCard } from '@/components/shared/ScaffoldCard';
import { useEffect, useState } from 'react';
import type { Mission } from '@/core/domain/entities/Mission';
import { VideoPlayer } from '@/components/mission/VideoPlayer';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

/**
 * Component props
 * @property missionId - Mission ID returned from POST /api/missions
 * @property initialMission - Optional initial mission data (avoids first fetch)
 */
type MissionStatusScaffoldProps = {
  missionId?: string;
  initialMission?: Mission;
};

export function MissionStatusScaffold({
  missionId,
  initialMission,
}: MissionStatusScaffoldProps) {
  // Local state for mission data (updates from polling)
  const [mission, setMission] = useState<Mission | null>(initialMission ?? null);
  const isPolling = mission?.status === 'queued' || mission?.status === 'processing';

  /**
   * Polling Effect - Updates mission status every 3 seconds
   *
   * Behavior:
   * - Only polls for active missions (queued/processing)
   * - Stops polling when mission reaches terminal state
   * - Cleans up interval on unmount or when dependencies change
   *
   * Dependencies:
   * - missionId: Re-run when mission ID changes
   * - mission: Re-run when mission status changes (to stop polling)
   */
  useEffect(() => {
    // Guard: Don't poll if no mission ID or mission data
    if (!missionId || !mission) return;

    const repository = new FirestoreMissionRepository(getFirestoreClient());

    const refreshMission = async () => {
      try {
        const latestMission = await repository.findById(missionId);

        if (latestMission) {
          setMission(latestMission);
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    };

    // Only poll for active missions (not completed/failed/cancelled)
    if (mission.status === 'queued' || mission.status === 'processing') {
      // Set up interval to poll every 3 seconds
      const interval = setInterval(async () => {
        void refreshMission();
      }, 3000); // Poll every 3 seconds

      void refreshMission();

      // Cleanup function: clear interval when effect re-runs or component unmounts
      // Prevents memory leaks and multiple concurrent intervals
      return () => clearInterval(interval);
    } else {
      // Mission is not active, stop polling
    }
  }, [missionId, mission]); // Re-run when missionId or mission changes

  /**
   * Format wait time for display
   *
   * @param seconds - Wait time in seconds
   * @returns Human-readable time string
   *
   * Examples:
   * - 0 -> "Ready to execute"
   * - 45 -> "45s"
   * - 180 -> "3m 0s"
   */
  const formatWaitTime = (seconds?: number): string => {
    if (seconds === undefined || seconds === 0) return 'Ready to execute';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) return `${remainingSeconds}s`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  /**
   * Get Tailwind color class based on mission status
   *
   * @param status - Mission status string
   * @returns Tailwind CSS color class
   *
   * Color Scheme:
   * - queued: yellow (waiting)
   * - processing: blue (active)
   * - completed: green (success)
   * - failed: red (error)
   * - cancelled: gray (neutral)
   */
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'queued': return 'text-yellow-400';
      case 'processing': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'cancelled': return 'text-gray-400';
      default: return 'text-slate-300';
    }
  };

  /**
   * Render Component
   *
   * Layout:
   * - ScaffoldCard wrapper with title and description
   * - Definition list (dl) displaying mission details
   * - Each row shows label (dt) and value (dd)
   *
   * Dynamic Content:
   * - Mission ID: truncated for display (first 8 chars)
   * - Queue Position: shows "N/A" before submission, then live position
   * - Estimated Wait: formatted as human-readable time
   * - Status: color-coded based on mission state
   */
  return (
    <ScaffoldCard
      eyebrow="Mission Status"
      title={missionId ? `Mission ${missionId.slice(0, 8)}...` : 'Queue Confirmation'}
      body={mission ? 'Live mission status with queue position updates.' : 'Submit a mission to see status.'}
      todos={[
        'TODO: User Story 58 / Task 60 - optionally capture email notification preferences.',
      ]}
    >
      {/* Definition list styled as a card */}
      <dl className="grid gap-3 rounded-2xl bg-slate-950/70 p-4 text-sm text-slate-300">
        {/* Mission ID Row */}
        <div className="flex items-center justify-between">
          <dt>Mission ID</dt>
          <dd className="font-mono text-xs text-orange-300">
            {missionId ?? 'pending-submit'}
          </dd>
        </div>

        {/* Queue Position Row - Updates via polling */}
        <div className="flex items-center justify-between">
          <dt>Queue Position</dt>
          <dd className="font-semibold text-white">
            {mission?.queuePosition ?? 'N/A'}
            {/* Show "(updating...)" indicator while polling */}
            {isPolling && <span className="ml-2 text-xs text-blue-400">(updating...)</span>}
          </dd>
        </div>

        {/* Estimated Wait Time Row */}
        <div className="flex items-center justify-between">
          <dt>Estimated Wait</dt>
          <dd className="font-semibold text-white">
            {formatWaitTime(mission?.estimatedWait)}
          </dd>
        </div>

        {/* Status Row - Color coded based on status */}
        <div className="flex items-center justify-between">
          <dt>Status</dt>
          <dd className={`font-semibold uppercase ${getStatusColor(mission?.status)}`}>
            {mission?.status ?? 'unknown'}
          </dd>
        </div>
      </dl>

      {/* Video Player - User Story 102, Task 104 */}
      {/* Show video when mission is completed and video URL is available */}
      {mission && (mission.status === 'completed' || mission.status === 'failed') && (mission.videoUrl || mission.youtubeUrl) && (
        <div className="mt-4">
          <VideoPlayer
            videoUrl={mission.videoUrl}
            youtubeUrl={mission.youtubeUrl}
            missionId={mission.id}
            title="Mission Execution Video"
            showDownload={true}
          />
        </div>
      )}

      {/* Video processing message for completed missions without video yet */}
      {mission && mission.status === 'completed' && !mission.videoUrl && !mission.youtubeUrl && (
        <div className="mt-4 rounded-lg bg-slate-800 p-4 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" />
          <p className="mt-2 text-sm text-slate-400">Video is being processed...</p>
          <p className="mt-1 text-xs text-slate-500">This usually takes 1-2 minutes</p>
        </div>
      )}
    </ScaffoldCard>
  );
}
