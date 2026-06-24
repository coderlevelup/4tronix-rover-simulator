'use client';

/**
 * Operator console — the operator side of close-the-loop.
 *
 * Lists submitted missions with their stored Python (Copy Python to run at the
 * yard), then lets the operator close the loop:
 *   queued/processing  → "Mark complete"
 *   completed (no video) → paste a YouTube URL → "Attach video"
 * The learner's mission + history views then show the video.
 *
 * Gated client-side via useAuth().isOperator; proxy.ts guards /operator
 * server-side and the API routes enforce verifyOperatorAuth.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Mission, MissionStatus } from '@/core/domain/entities/Mission';

const STATUS_PILL: Record<MissionStatus, string> = {
  queued: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  processing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export default function OperatorPage() {
  const { isOperator, loading: authLoading } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

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

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
      </main>
    );
  }

  if (!isOperator) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Operator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an operator account to view this page.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Go to operator login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
          Operator Console
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Missions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Copy the Python and run it at the yard, mark a mission complete, then attach the
          YouTube video so the learner sees their run.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : missions.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg font-bold text-foreground">No missions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">New submissions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {missions.map((mission) => {
            const busy = busyId === mission.id;
            const actErr = actionError[mission.id];
            return (
              <article
                key={mission.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/50"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-display text-base font-bold text-foreground">
                        {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL[mission.status]}`}
                      >
                        {mission.status}
                      </span>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {mission.yardId} · {new Date(mission.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => copyPython(mission)}
                    className="shrink-0 rounded-full bg-gradient-mars px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    {copiedId === mission.id ? 'Copied ✓' : 'Copy Python'}
                  </button>
                </div>

                <pre className="max-h-72 overflow-auto bg-background/80 p-4 text-xs leading-relaxed text-foreground">
                  <code>{mission.code.trim() || '// No code'}</code>
                </pre>

                {/* Close-the-loop actions */}
                <div className="border-t border-border/50 px-4 py-3">
                  {(mission.status === 'queued' || mission.status === 'processing') && (
                    <button
                      onClick={() => markComplete(mission)}
                      disabled={busy}
                      className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {busy ? 'Working…' : 'Mark complete'}
                    </button>
                  )}

                  {mission.status === 'completed' && !mission.youtubeUrl && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="url"
                        value={urlDrafts[mission.id] ?? ''}
                        onChange={(e) =>
                          setUrlDrafts((prev) => ({ ...prev, [mission.id]: e.target.value }))
                        }
                        placeholder="https://youtube.com/watch?v=…"
                        className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => attachVideo(mission)}
                        disabled={busy}
                        className="shrink-0 rounded-lg bg-gradient-mars px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {busy ? 'Working…' : 'Attach video'}
                      </button>
                    </div>
                  )}

                  {mission.status === 'completed' && mission.youtubeUrl && (
                    <a
                      href={mission.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:underline"
                    >
                      ✓ Video attached — view
                    </a>
                  )}

                  {mission.status === 'failed' && (
                    <p className="text-xs text-muted-foreground">Marked failed — no further action.</p>
                  )}

                  {actErr && <p className="mt-2 text-xs text-destructive">{actErr}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
