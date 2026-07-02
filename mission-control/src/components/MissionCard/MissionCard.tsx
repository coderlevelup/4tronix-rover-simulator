'use client';

import Link from 'next/link';
import { Play, Rocket } from 'lucide-react';
import { Mission } from '@/core/domain/entities/Mission';
import { getDiscoveryStatus, DISCOVERY_BADGE_CLASS } from '@/lib/discoveryStatus';

function getYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Human-friendly run time: "8s" or "1:23". */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface MissionCardProps {
  mission: Mission;
  /** Show the learner identifier - intended for operator views */
  showLearnerId?: boolean;
}

/**
 * Learner-facing mission card (the history feed). Always uses the discovery
 * status (Completed / Pending) so a learner never sees their mission as
 * "Failed"; links through to the full mission detail page.
 */
export function MissionCard({ mission, showLearnerId = false }: MissionCardProps) {
  const discoveryStatus = getDiscoveryStatus(mission.status);
  const videoUrl = mission.youtubeUrl || mission.videoUrl;
  const youtubeId = getYouTubeId(videoUrl);
  const thumbnailUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
  const durationMs = mission.executionMetadata?.duration_ms;

  return (
    <Link
      href={`/missions/${mission.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/50 transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-primary/50 hover:clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnail hosts vary per mission record; next/image would need remotePatterns per host
          <img
            src={thumbnailUrl}
            alt={`${mission.name || 'Mission'} thumbnail`}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-secondary to-background text-muted-foreground/50">
            <Rocket className="h-9 w-9" />
            <p className="mt-2 text-xs font-semibold">Run on its way</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

        <span
          className={`absolute left-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm ${DISCOVERY_BADGE_CLASS[discoveryStatus]}`}
        >
          {discoveryStatus}
        </span>

        {durationMs ? (
          <span className="absolute bottom-3 right-3 z-10 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-white">
            {formatDuration(durationMs)}
          </span>
        ) : null}

        {thumbnailUrl ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/95 shadow-lg ring-4 ring-white/15">
              <Play className="ml-0.5 h-6 w-6 text-primary-foreground" fill="currentColor" />
            </span>
          </div>
        ) : null}
      </div>

      {/* Title + meta */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-bold text-foreground transition-colors group-hover:text-primary">
            {mission.name ?? `Mission-${mission.id.slice(0, 8)}`}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-mono">{mission.yardId}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{new Date(mission.submittedAt).toLocaleDateString()}</span>
          </p>
        </div>
        {showLearnerId && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{mission.learnerId}</span>
        )}
      </div>
    </Link>
  );
}
