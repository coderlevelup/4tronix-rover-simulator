'use client';

import { Mission, MissionStatus } from '@/core/domain/entities/Mission';

function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}`;
  }
  return null;
}

const STATUS_STYLES: Record<MissionStatus, { pill: string; label: string }> = {
  queued:     { pill: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',   label: 'Queued' },
  processing: { pill: 'bg-orange-500/20 text-orange-400 border border-orange-500/30', label: 'Running' },
  completed:  { pill: 'bg-green-500/20 text-green-400 border border-green-500/30', label: 'Completed' },
  failed:     { pill: 'bg-red-500/20 text-red-400 border border-red-500/30',       label: 'Failed' },
  cancelled:  { pill: 'bg-slate-500/20 text-slate-400 border border-slate-500/30', label: 'Cancelled' },
};

interface MissionCardProps {
  mission: Mission;
  /** Show the learner identifier — intended for operator views */
  showLearnerId?: boolean;
  /** Show challenge badge when true and mission.challengeId is set */
  showChallengeBadge?: boolean;
}

export function MissionCard({ mission, showLearnerId = false, showChallengeBadge = true }: MissionCardProps) {
  const status = STATUS_STYLES[mission.status];
  const videoUrl = mission.youtubeUrl || mission.videoUrl;
  const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold text-white truncate">
            {mission.name ?? `Mission ${mission.id.slice(0, 8)}`}
          </h3>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${status.pill}`}>
            {status.label}
          </span>
          {showChallengeBadge && mission.challengeId && (
            <span className="shrink-0 rounded-full bg-purple-500/20 border border-purple-500/30 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
              {mission.challengeId}
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3 font-mono text-xs text-slate-500">
          {showLearnerId && (
            <span className="text-slate-400">
              {mission.learnerEmail ?? mission.learnerId ?? mission.sessionId}
            </span>
          )}
          <span>{new Date(mission.submittedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Code | Video panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        {/* Code panel */}
        <div className="p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Code</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300 max-h-56">
            <code>{mission.code.trim() || '// No code'}</code>
          </pre>
        </div>

        {/* Video panel */}
        <div className="p-4 flex flex-col">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Video</p>
          {embedUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-lg bg-black border border-slate-800">
              <iframe
                src={embedUrl}
                title={`Mission ${mission.id} video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 py-8 text-center">
              <div>
                <svg className="mx-auto h-8 w-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="mt-2 text-xs text-slate-500">
                  {mission.status === 'completed' ? 'No video yet' : 'Video available after execution'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
