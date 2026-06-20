'use client';

import { useEffect, useState } from 'react';
import { Mission, MissionStatus } from '@/core/domain/entities/Mission';
import type { YardStatus } from '@/core/domain/entities/Yard';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { OPERATOR_ID_HEADER, OPERATOR_ACCESS_HEADER, OPERATOR_YARDS_HEADER } from '@/infrastructure/auth/operator-claims';
import { Clock, Flame, CheckCircle2, XCircle, Ban, Satellite, RotateCcw, Play, Telescope, Inbox, RefreshCw, Film, Video, Zap } from 'lucide-react';

const STATUS_CONFIG: Record<MissionStatus, {
  label: string;
  icon: React.ElementType;
  pillClass: string;
  barClass: string;
}> = {
  queued:     { label: 'Awaiting Launch', icon: Clock, pillClass: 'bg-muted text-muted-foreground border-border',                              barClass: 'bg-muted-foreground' },
  processing: { label: 'Executing',       icon: Flame, pillClass: 'bg-[oklch(0.78_0.18_55)]/15 text-[oklch(0.78_0.18_55)] border-[oklch(0.78_0.18_55)]/30', barClass: 'bg-[oklch(0.78_0.18_55)] animate-pulse' },
  completed:  { label: 'Mission Done',    icon: CheckCircle2, pillClass: 'bg-[oklch(0.74_0.18_175)]/15 text-[oklch(0.74_0.18_175)] border-[oklch(0.74_0.18_175)]/30', barClass: 'bg-[oklch(0.74_0.18_175)]' },
  failed:     { label: 'Failed',          icon: XCircle, pillClass: 'bg-destructive/15 text-destructive border-destructive/30',                  barClass: 'bg-destructive' },
  cancelled:  { label: 'Cancelled',       icon: Ban, pillClass: 'bg-muted text-muted-foreground/60 border-border',                          barClass: 'bg-muted-foreground/40' },
};

type FilterStatus = 'all' | MissionStatus;

const FILTERS: { value: FilterStatus; label: string; icon: React.ElementType }[] = [
  { value: 'all',        label: 'All',     icon: Satellite },
  { value: 'queued',     label: 'Queue',   icon: Clock },
  { value: 'processing', label: 'Running', icon: Flame },
  { value: 'completed',  label: 'Done',    icon: CheckCircle2 },
  { value: 'failed',     label: 'Failed',  icon: XCircle },
];

export function MissionQueue({ yardStatus }: { yardStatus: YardStatus }) {
  const { operatorId, operatorRole, operatorYards } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [executingMissions, setExecutingMissions] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [youtubeUrlModal, setYoutubeUrlModal] = useState<{ missionId: string; missionName: string } | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState('');
  const [submittingYoutubeUrl, setSubmittingYoutubeUrl] = useState(false);
  const [videoViewModal, setVideoViewModal] = useState<{ missionId: string; missionName: string; youtubeUrl: string } | null>(null);
  const [markingFailed, setMarkingFailed] = useState<Set<string>>(new Set());

  const parseJsonResponse = async (response: Response) => {
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return response.json();
  };

  const fetchMissions = async () => {
    try {
      const response = await fetch('/api/operator/missions');
      if (response.redirected && response.url.includes('/login')) { window.location.assign('/login'); return; }
      const data = await parseJsonResponse(response);
      if (!data) { setError('Unexpected server response'); return; }
      if (data.success) setMissions(data.missions);
      else setError(data.error || 'Failed to fetch missions');
    } catch { setError('Failed to connect to server'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchMissions(); }, []);

  const makeAuthHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (operatorId && operatorRole) {
      h[OPERATOR_ID_HEADER] = operatorId;
      h[OPERATOR_ACCESS_HEADER] = operatorRole;
      if (operatorYards?.length) h[OPERATOR_YARDS_HEADER] = operatorYards.join(',');
    }
    return h;
  };

  const handleRunRover = (missionId: string) => window.location.assign(`/operator/rover/${missionId}`);

  const handleMarkAsFailed = async (missionId: string) => {
    if (!confirm('Mark this mission as failed? This action cannot be undone.')) return;
    setMarkingFailed(prev => new Set(prev).add(missionId));
    try {
      const res = await fetch(`/api/operator/missions/${missionId}`, { method: 'PATCH', headers: makeAuthHeaders(), body: JSON.stringify({ action: 'mark-failed' }) });
      const data = await res.json();
      if (res.ok && data.success) { toast.success('Mission marked as failed 💥'); await fetchMissions(); }
      else toast.error(data.error || 'Failed to update mission');
    } catch { toast.error('Failed to connect to server'); }
    finally { setMarkingFailed(prev => { const n = new Set(prev); n.delete(missionId); return n; }); }
  };

  const validateYoutubeUrl = (url: string): string | null => {
    if (!url.trim()) return 'YouTube URL is required';
    const patterns = [/^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/, /^https?:\/\/youtu\.be\/[\w-]+/];
    if (!patterns.some(p => p.test(url.trim()))) return 'Enter a valid YouTube URL';
    return null;
  };

  const handleSubmitYoutubeUrl = async () => {
    const err = validateYoutubeUrl(youtubeUrl);
    if (err) { setYoutubeUrlError(err); return; }
    if (!youtubeUrlModal) return;
    setSubmittingYoutubeUrl(true); setYoutubeUrlError('');
    try {
      const res = await fetch(`/api/operator/missions/${youtubeUrlModal.missionId}`, { method: 'PATCH', headers: makeAuthHeaders(), body: JSON.stringify({ action: 'add-youtube-url', youtubeUrl: youtubeUrl.trim() }) });
      const data = await res.json();
      if (res.ok && data.success) { toast.success('Video added! 🎬'); setYoutubeUrlModal(null); setYoutubeUrl(''); await fetchMissions(); }
      else toast.error(data.error || 'Failed to add video');
    } catch { toast.error('Failed to connect to server'); }
    finally { setSubmittingYoutubeUrl(false); }
  };

  const getYoutubeEmbedUrl = (url: string) => {
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
    for (const p of patterns) { const m = url.match(p); if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}`; }
    return url;
  };

  const filteredMissions = filterStatus === 'all' ? missions : missions.filter(m => m.status === filterStatus);
  const statusCounts: Record<string, number> = {
    all: missions.length,
    queued: missions.filter(m => m.status === 'queued').length,
    processing: missions.filter(m => m.status === 'processing').length,
    completed: missions.filter(m => m.status === 'completed').length,
    failed: missions.filter(m => m.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-12 text-center shadow-card">
        <div className="inline-flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-primary shadow-glow-mars" />
            <div className="absolute inset-3 animate-pulse rounded-full bg-primary/20" />
          </div>
          <p className="font-display text-sm font-bold text-muted-foreground">Scanning for missions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur p-6 shadow-card">
        <div className="flex items-center gap-3">
          <XCircle className="w-8 h-8 text-destructive" />
          <div>
            <p className="font-display text-sm font-bold text-destructive">Transmission Lost</p>
            <p className="font-mono text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-display)',
            fontSize: '13px',
            borderRadius: '1rem',
          },
        }}
      />

      {/* Video view modal */}
      {videoViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-muted-foreground" />
                <p className="font-display text-sm font-bold text-foreground">Mission Recording</p>
              </div>
              <button onClick={() => setVideoViewModal(null)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="font-mono text-xs text-muted-foreground">{videoViewModal.missionName}</p>
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-black border border-border">
                <iframe src={getYoutubeEmbedUrl(videoViewModal.youtubeUrl)} title="Mission Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setVideoViewModal(null)} className="px-5 py-2.5 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Close</button>
                <a href={videoViewModal.youtubeUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:text-primary/80 transition-colors">Open in YouTube →</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YouTube URL modal */}
      {youtubeUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-muted-foreground" />
                <p className="font-display text-sm font-bold text-foreground">Add Mission Video</p>
              </div>
              <button onClick={() => { setYoutubeUrlModal(null); setYoutubeUrl(''); setYoutubeUrlError(''); }} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl bg-muted/50 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Mission</p>
                <p className="font-display text-sm font-bold text-foreground mt-0.5">{youtubeUrlModal.missionName}</p>
              </div>
              <div>
                <label htmlFor="youtube-url-input" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">YouTube URL</label>
                <input
                  id="youtube-url-input"
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeUrlError(''); }}
                  disabled={submittingYoutubeUrl}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submittingYoutubeUrl) handleSubmitYoutubeUrl();
                    if (e.key === 'Escape') { setYoutubeUrlModal(null); setYoutubeUrl(''); setYoutubeUrlError(''); }
                  }}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors disabled:opacity-50"
                />
                {youtubeUrlError
                  ? <p className="font-mono text-xs text-destructive mt-2">⚠️ {youtubeUrlError}</p>
                  : <p className="font-mono text-xs text-muted-foreground mt-2">youtube.com/watch?v=... or youtu.be/...</p>
                }
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => { setYoutubeUrlModal(null); setYoutubeUrl(''); setYoutubeUrlError(''); }} disabled={submittingYoutubeUrl} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">Cancel</button>
              <button onClick={handleSubmitYoutubeUrl} disabled={submittingYoutubeUrl} className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-mars px-4 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-glow-mars hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0">
                {submittingYoutubeUrl ? <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Saving...</> : <><Video className="w-4 h-4" /> Add Video</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {filteredMissions.length} of {missions.length} missions
        </p>
        <div className="flex items-center gap-2">
          {/* Filter pills */}
          <div className="flex items-center gap-1 rounded-2xl border border-border bg-card/60 backdrop-blur p-1">
            {FILTERS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilterStatus(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-display text-xs font-bold transition-all duration-200 ${
                  filterStatus === value
                    ? 'bg-gradient-mars text-primary-foreground shadow-glow-mars'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span className="opacity-60">{statusCounts[value] ?? 0}</span>
              </button>
            ))}
          </div>

          <button onClick={fetchMissions} className="p-2 rounded-xl text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Empty states */}
      {filteredMissions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-12 text-center shadow-card">
          {missions.length > 0 ? (
            <Telescope className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          ) : (
            <Inbox className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          )}
          <p className="font-display text-base font-bold text-foreground">
            {missions.length > 0 ? 'No missions match this filter' : 'No missions yet, Cadet'}
          </p>
          <p className="font-mono text-xs text-muted-foreground mt-2">
            {missions.length > 0 ? 'Try a different filter above' : 'Mission submissions will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMissions.map((mission, index) => {
            const isMarkingAsFailed = markingFailed.has(mission.id);
            const cfg = STATUS_CONFIG[mission.status];
            const StatusIcon = cfg.icon;

            return (
              <article
                key={mission.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-4 shadow-card hover:border-primary/30 hover:shadow-glow-mars transition-all duration-200"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Left status bar */}
                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${cfg.barClass}`} />

                <div className="pl-4 flex items-center justify-between gap-3">
                  {/* Mission info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-display text-sm font-bold text-foreground truncate">
                        {mission.name || 'Untitled Mission'}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${cfg.pillClass}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                      <span>{new Date(mission.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      {mission.status === 'failed' && mission.executionResult?.errorMessage && (
                        <span className="text-destructive truncate">{mission.executionResult.errorMessage}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    {mission.status === 'queued' && (
                      <button
                        onClick={() => handleRunRover(mission.id)}
                        disabled={yardStatus === 'offline'}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-4 py-2 font-display text-xs font-bold text-primary-foreground shadow-glow-mars hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        <Zap className="h-3.5 w-3.5 animate-blast" />
                        Launch
                      </button>
                    )}
                    {mission.status === 'processing' && (
                      <button
                        onClick={() => handleMarkAsFailed(mission.id)}
                        disabled={isMarkingAsFailed}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 font-display text-xs font-bold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-40"
                      >
                        {isMarkingAsFailed ? '...' : <><XCircle className="w-3.5 h-3.5" /> Abort</>}
                      </button>
                    )}
                    {mission.status === 'failed' && (
                      <button
                        onClick={() => handleRunRover(mission.id)}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-[oklch(0.78_0.18_55)]/40 bg-[oklch(0.78_0.18_55)]/10 px-4 py-2 font-display text-xs font-bold text-[oklch(0.78_0.18_55)] hover:bg-[oklch(0.78_0.18_55)]/20 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Retry
                      </button>
                    )}
                    {mission.status === 'completed' && (
                      mission.youtubeUrl && typeof mission.youtubeUrl === 'string' ? (
                        <button
                          onClick={() => setVideoViewModal({ missionId: mission.id, missionName: mission.name || 'Untitled Mission', youtubeUrl: mission.youtubeUrl as string })}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-[oklch(0.74_0.18_175)]/40 bg-[oklch(0.74_0.18_175)]/10 px-4 py-2 font-display text-xs font-bold text-[oklch(0.74_0.18_175)] hover:bg-[oklch(0.74_0.18_175)]/20 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" /> Watch
                        </button>
                      ) : (
                        <button
                          onClick={() => { setYoutubeUrlModal({ missionId: mission.id, missionName: mission.name || 'Untitled Mission' }); setYoutubeUrl(''); setYoutubeUrlError(''); }}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-muted/60 px-4 py-2 font-display text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" /> Add Video
                        </button>
                      )
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}