'use client';

/**
 * Operator console, the operator side of close-the-loop.
 *
 * A pipeline view of submitted missions: a stage strip (Queued, Running,
 * Awaiting video, Published, Failed) doubles as the filter and the at-a-glance
 * status board. Each mission card carries its stored Python (Copy Python) and
 * saved blocks (Copy blocks) plus the one action that moves it down the
 * pipeline: mark a mission complete, then attach the YouTube video so the
 * learner sees their run.
 *
 * Gated client-side via useAuth().isOperator; proxy.ts guards /operator
 * server-side and the API routes enforce verifyOperatorAuth.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  Video,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Mission, MissionStatus } from '@/core/domain/entities/Mission';

/** True (operator-facing) status presentation. Status colour, not theme token. */
const STATUS_META: Record<MissionStatus, { label: string; pill: string; bar: string; dot: string }> = {
  queued:     { label: 'Queued',    pill: 'bg-blue-500/15 text-blue-300 border-blue-500/30',       bar: 'bg-blue-500',    dot: 'bg-blue-400' },
  processing: { label: 'Running',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30',    bar: 'bg-amber-500',   dot: 'bg-amber-400' },
  completed:  { label: 'Completed', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', bar: 'bg-emerald-500', dot: 'bg-emerald-400' },
  failed:     { label: 'Failed',    pill: 'bg-red-500/15 text-red-300 border-red-500/30',          bar: 'bg-red-500',     dot: 'bg-red-400' },
  cancelled:  { label: 'Cancelled', pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30',    bar: 'bg-slate-500',   dot: 'bg-slate-400' },
};

type StageKey = 'all' | 'queued' | 'processing' | 'awaiting-video' | 'published' | 'failed';

/** Stage strip = pipeline order (also the filter). Awaiting-video is the TODO. */
const STAGES: { key: StageKey; label: string; dot: string }[] = [
  { key: 'all',            label: 'All',            dot: 'bg-muted-foreground' },
  { key: 'queued',         label: 'Queued',         dot: 'bg-blue-400' },
  { key: 'processing',     label: 'Running',        dot: 'bg-amber-400' },
  { key: 'awaiting-video', label: 'Awaiting video', dot: 'bg-primary' },
  { key: 'published',      label: 'Published',      dot: 'bg-emerald-400' },
  { key: 'failed',         label: 'Failed',         dot: 'bg-red-400' },
];

const isAwaitingVideo = (m: Mission) => m.status === 'completed' && !m.youtubeUrl;
const isPublished = (m: Mission) => m.status === 'completed' && !!m.youtubeUrl;

function matchesStage(m: Mission, stage: StageKey): boolean {
  switch (stage) {
    case 'all': return true;
    case 'queued': return m.status === 'queued';
    case 'processing': return m.status === 'processing';
    case 'awaiting-video': return isAwaitingVideo(m);
    case 'published': return isPublished(m);
    case 'failed': return m.status === 'failed';
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function OperatorPage() {
  const { isOperator, loading: authLoading } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedBlocksId, setCopiedBlocksId] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageKey>('all');

  const loadMissions = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/missions');
      if (res.status === 401) {
        throw new Error('Your session is not authorized as an operator.');
      }
      if (!res.ok) {
        throw new Error(`Failed to load missions (HTTP ${res.status})`);
      }
      const data = await res.json();
      const visible = ((data.missions as Mission[]) ?? [])
        .filter((m) => m.status !== 'cancelled')
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );
      setMissions(visible);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load missions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isOperator) {
      setLoading(false);
      return;
    }
    loadMissions();
  }, [authLoading, isOperator, loadMissions]);

  const refresh = () => {
    setRefreshing(true);
    loadMissions();
  };

  const counts = useMemo(() => {
    const c: Record<StageKey, number> = {
      all: missions.length,
      queued: 0,
      processing: 0,
      'awaiting-video': 0,
      published: 0,
      failed: 0,
    };
    for (const m of missions) {
      if (m.status === 'queued') c.queued += 1;
      else if (m.status === 'processing') c.processing += 1;
      else if (m.status === 'failed') c.failed += 1;
      if (isAwaitingVideo(m)) c['awaiting-video'] += 1;
      if (isPublished(m)) c.published += 1;
    }
    return c;
  }, [missions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return missions.filter((m) => {
      if (!matchesStage(m, stage)) return false;
      if (!q) return true;
      return (
        (m.name ?? '').toLowerCase().includes(q) ||
        m.yardId.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [missions, query, stage]);

  const patch = async (mission: Mission, body: Record<string, unknown>) => {
    setBusyId(mission.id);
    setActionError((prev) => ({ ...prev, [mission.id]: '' }));
    try {
      const res = await fetch(`/api/operator/missions/${mission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Action failed (HTTP ${res.status})`);
      }
      await loadMissions();
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [mission.id]: err instanceof Error ? err.message : 'Action failed',
      }));
    } finally {
      setBusyId(null);
    }
  };

  const markComplete = (mission: Mission) => patch(mission, { action: 'mark-complete' });

  const attachVideo = (mission: Mission) => {
    const url = (urlDrafts[mission.id] ?? '').trim();
    if (!url) {
      setActionError((prev) => ({ ...prev, [mission.id]: 'Paste a YouTube URL first.' }));
      return;
    }
    patch(mission, { action: 'add-youtube-url', youtubeUrl: url });
  };

  const copyPython = async (mission: Mission) => {
    try {
      await navigator.clipboard.writeText(mission.code);
      setCopiedId(mission.id);
      setTimeout(
        () => setCopiedId((current) => (current === mission.id ? null : current)),
        2000
      );
    } catch {
      setActionError((prev) => ({ ...prev, [mission.id]: 'Could not copy to clipboard.' }));
    }
  };

  const copyBlocks = async (mission: Mission) => {
    if (!mission.blocklyState) return;
    try {
      await navigator.clipboard.writeText(mission.blocklyState);
      setCopiedBlocksId(mission.id);
      setTimeout(
        () => setCopiedBlocksId((current) => (current === mission.id ? null : current)),
        2000
      );
    } catch {
      setActionError((prev) => ({ ...prev, [mission.id]: 'Could not copy to clipboard.' }));
    }
  };

  if (authLoading) {
    return (
      <main className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
      </main>
    );
  }

  if (!isOperator) {
    return (
      <main className="mx-auto flex h-[calc(100vh-64px)] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card/60 clay">
          <ShieldAlert className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-foreground">Operator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an operator account to view the mission queue.
        </p>
        <Link
          href="/login"
          className="clay clay-press mt-6 rounded-2xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
        >
          Go to operator login
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex h-[calc(100vh-64px)] flex-col overflow-hidden px-4 sm:px-6">
      <div className="mx-auto w-full max-w-5xl shrink-0 pt-5">
        {/* Title row + search/refresh */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
              Operator Console
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-foreground">Mission Queue</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, yard, id"
                aria-label="Search missions"
                className="w-48 rounded-full border border-border/60 bg-card/50 py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:w-60"
              />
            </div>
            <button
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh missions"
              className="clay-press flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Pipeline stage strip (at-a-glance board + filter) */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STAGES.map((s) => {
            const active = stage === s.key;
            const isTodo = s.key === 'awaiting-video' && counts[s.key] > 0;
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                aria-pressed={active}
                className={`flex flex-col items-start rounded-2xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-primary/60 bg-card clay'
                    : isTodo
                      ? 'border-primary/40 bg-primary/10 hover:bg-primary/15'
                      : 'border-border/60 bg-card/40 hover:bg-card/70'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">
                  {counts[s.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List (scrolls internally) */}
      <div className="mx-auto mt-3 min-h-0 w-full max-w-5xl flex-1 overflow-y-auto scroll-panel pb-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
        ) : error ? (
          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center clay">
            <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
            <p className="mt-3 text-sm text-destructive">{error}</p>
            <button
              onClick={refresh}
              className="clay-press mt-5 rounded-xl border border-border bg-card/60 px-4 py-2 text-xs font-bold text-foreground"
            >
              Try again
            </button>
          </div>
        ) : missions.length === 0 ? (
          <EmptyState title="No missions yet" subtitle="New submissions will appear here as learners send them." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nothing in this stage"
            subtitle="Try a different stage or search."
            onClear={() => {
              setQuery('');
              setStage('all');
            }}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((mission) => {
              const busy = busyId === mission.id;
              const actErr = actionError[mission.id];
              const meta = STATUS_META[mission.status];
              const lineCount = mission.code.trim() ? mission.code.trim().split('\n').length : 0;
              const awaiting = isAwaitingVideo(mission);
              const published = isPublished(mission);
              return (
                <article
                  key={mission.id}
                  className="flex overflow-hidden rounded-2xl border border-border/60 bg-card/50"
                >
                  {/* Status accent rail */}
                  <span className={`w-1.5 shrink-0 ${meta.bar}`} aria-hidden />

                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate font-display text-base font-bold text-foreground">
                            {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                          </h2>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {mission.yardId} · {relativeTime(mission.submittedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {mission.blocklyState && (
                          <button
                            onClick={() => copyBlocks(mission)}
                            className="clay-press flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-primary"
                          >
                            {copiedBlocksId === mission.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedBlocksId === mission.id ? 'Copied' : 'Copy blocks'}
                          </button>
                        )}
                        <button
                          onClick={() => copyPython(mission)}
                          className="clay clay-press flex items-center gap-1.5 rounded-full bg-gradient-mars px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
                        >
                          {copiedId === mission.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === mission.id ? 'Copied' : 'Copy Python'}
                        </button>
                      </div>
                    </div>

                    {/* Code */}
                    <div className="bg-background/60">
                      <div className="flex items-center gap-1.5 border-b border-border/40 px-4 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-400/70" />
                        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          mission.py
                        </span>
                        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                        </span>
                      </div>
                      <pre className="max-h-56 overflow-auto scroll-panel p-4 text-xs leading-relaxed text-foreground">
                        <code>{mission.code.trim() || '# No code'}</code>
                      </pre>
                    </div>

                    {/* State-aware action footer */}
                    <div className={`border-t border-border/50 px-4 py-3 ${awaiting ? 'bg-primary/[0.06]' : ''}`}>
                      {(mission.status === 'queued' || mission.status === 'processing') && (
                        <button
                          onClick={() => markComplete(mission)}
                          disabled={busy}
                          className="clay-press inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {busy ? 'Working...' : 'Mark complete'}
                        </button>
                      )}

                      {awaiting && (
                        <div className="space-y-2">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
                            <Video className="h-4 w-4" />
                            Attach the run video to finish
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              type="url"
                              value={urlDrafts[mission.id] ?? ''}
                              onChange={(e) =>
                                setUrlDrafts((prev) => ({ ...prev, [mission.id]: e.target.value }))
                              }
                              placeholder="https://youtube.com/watch?v=..."
                              className="flex-1 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                            />
                            <button
                              onClick={() => attachVideo(mission)}
                              disabled={busy}
                              className="clay clay-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-mars px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                            >
                              <Video className="h-4 w-4" />
                              {busy ? 'Working...' : 'Attach video'}
                            </button>
                          </div>
                        </div>
                      )}

                      {published && (
                        <a
                          href={mission.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:underline"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Video attached
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      )}

                      {mission.status === 'failed' && (
                        <p className="text-xs text-muted-foreground">Marked failed, no further action.</p>
                      )}

                      {actErr && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {actErr}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({
  title,
  subtitle,
  onClear,
}: {
  title: string;
  subtitle: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card/60 clay">
        <Inbox className="h-8 w-8 text-primary" />
      </div>
      <p className="mt-5 font-display text-xl font-bold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      {onClear && (
        <button
          onClick={onClear}
          className="clay-press mt-6 rounded-2xl border border-border bg-card/50 px-5 py-2.5 text-sm font-semibold text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
