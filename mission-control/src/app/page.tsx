'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, X, Plus, Play, Rocket } from 'lucide-react';
import { Mission } from '@/core/domain/entities/Mission';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import {
  getDiscoveryStatus,
  DISCOVERY_BADGE_CLASS,
  type DiscoveryStatus,
} from '@/lib/discoveryStatus';

function getYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match?.[1]) return match[1];
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

type StatusFilter = 'all' | DiscoveryStatus;

export default function LandingPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const loadMissions = async () => {
      const timeoutId = setTimeout(() => {
        console.warn('[Landing] Mission loading is taking longer than expected (>10s)');
      }, 10000);

      try {
        const repository = new FirestoreMissionRepository(getFirestoreClient());
        const loadedMissions = await repository.findAll();

        const recentMissions = loadedMissions
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          .slice(0, 24);

        setMissions(recentMissions);
        setError(null);
      } catch (err) {
        console.error('[Landing] Failed to load missions:', err);
        let errorMessage = 'Failed to load missions. ';

        if (err instanceof Error) {
          errorMessage += err.message;
          if (err.message.includes('Missing or insufficient permissions')) {
            errorMessage = 'Database permissions error. Please check Firestore security rules.';
          } else if (err.message.includes('projectId')) {
            errorMessage = 'Firebase is not configured. Please set up environment variables.';
          } else if (err.message.includes('network') || err.message.includes('fetch')) {
            errorMessage = 'Network error. Please check your internet connection.';
          }
        } else {
          errorMessage += 'Unknown error occurred.';
        }

        setError(errorMessage);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    loadMissions();
  }, []);

  const counts = useMemo(() => {
    let completed = 0;
    for (const m of missions) {
      if (getDiscoveryStatus(m.status) === 'Completed') completed += 1;
    }
    return { all: missions.length, Completed: completed, Pending: missions.length - completed };
  }, [missions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return missions.filter((m) => {
      if (statusFilter !== 'all' && getDiscoveryStatus(m.status) !== statusFilter) return false;
      if (!q) return true;
      return (m.name ?? '').toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
    });
  }, [missions, query, statusFilter]);

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'Completed', label: 'Completed', count: counts.Completed },
    { key: 'Pending', label: 'Pending', count: counts.Pending },
  ];

  return (
    <main className="relative flex h-[calc(100vh-64px)] flex-col overflow-hidden px-4 sm:px-6">
      {/* Header (the Create Mission action lives in the navbar) */}
      <header className="mx-auto w-full max-w-6xl shrink-0 pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Mission <span className="text-gradient-mars">Feed</span>
        </h1>
        <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
          Watch real rovers run the code kids wrote on Mars.
        </p>
      </header>

      {/* Toolbar: search + status filters */}
      <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-col gap-2.5 pb-3 md:flex-row md:items-center">
        <div className="relative md:max-w-xs md:flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search missions"
            aria-label="Search missions by name or code"
            className="w-full rounded-full border border-border/60 bg-card/60 py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Filter missions by status">
          {filters.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                  active
                    ? 'bg-gradient-mars text-primary-foreground'
                    : 'border border-border/70 bg-card/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    active ? 'bg-black/20 text-primary-foreground' : 'bg-background/60 text-muted-foreground'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed: the only thing that scrolls */}
      <section className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto scroll-panel pb-5">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
        ) : error ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-destructive/40 bg-destructive/10 p-8 text-center clay">
            <h3 className="font-display text-lg font-bold text-destructive">Unable to load missions</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="clay clay-press mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
            >
              Retry
            </button>
          </div>
        ) : missions.length === 0 ? (
          <EmptyState
            title="No missions yet"
            subtitle="Be the first to send a rover across Mars."
            cta
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No missions match"
            subtitle="Try a different name, code, or filter."
            onClear={() => {
              setQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 pt-1 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((mission) => {
              const videoUrl = mission.youtubeUrl || mission.videoUrl;
              const youtubeId = getYouTubeId(videoUrl);
              const thumbnailUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
              const discoveryStatus = getDiscoveryStatus(mission.status);
              const durationMs = mission.executionMetadata?.duration_ms;

              return (
                <Link
                  key={mission.id}
                  href={`/missions/${mission.id}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/50 transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-primary/50 hover:clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={`${mission.name || 'Mission'} thumbnail`}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-secondary to-background text-muted-foreground/50">
                        <Rocket className="h-10 w-10" />
                        <p className="mt-2 text-xs font-semibold">Run on its way</p>
                      </div>
                    )}

                    {/* Scrim for badge legibility */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

                    {/* Status */}
                    <span
                      className={`absolute left-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm ${DISCOVERY_BADGE_CLASS[discoveryStatus]}`}
                    >
                      {discoveryStatus}
                    </span>

                    {/* Run time */}
                    {durationMs ? (
                      <span className="absolute bottom-3 right-3 z-10 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                        {formatDuration(durationMs)}
                      </span>
                    ) : null}

                    {/* Play affordance on hover */}
                    {thumbnailUrl ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/95 shadow-lg ring-4 ring-white/15">
                          <Play className="ml-0.5 h-6 w-6 text-primary-foreground" fill="currentColor" />
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Title + meta */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border/60">
                      <Image
                        src="/rover-hero.jpg"
                        alt=""
                        width={72}
                        height={72}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-base font-bold text-foreground transition-colors group-hover:text-primary">
                        {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate font-mono">{mission.yardId}</span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0">{new Date(mission.submittedAt).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Code peek */}
                  <div className="relative mx-4 mb-4 overflow-hidden rounded-xl border border-border/50 bg-background/60">
                    <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-block-stop/70" />
                      <span className="h-2 w-2 rounded-full bg-block-hat/70" />
                      <span className="h-2 w-2 rounded-full bg-buzz/70" />
                      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        mission.py
                      </span>
                    </div>
                    <pre className="max-h-20 overflow-hidden px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                      <code>{mission.code.trim() || '# No code'}</code>
                    </pre>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card/95 to-transparent" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function EmptyState({
  title,
  subtitle,
  cta,
  onClear,
}: {
  title: string;
  subtitle: string;
  cta?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card/60 clay">
        <Rocket className="h-8 w-8 text-primary" />
      </div>
      <p className="mt-5 font-display text-xl font-bold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      {cta && (
        <Link
          href="/mission"
          className="clay clay-press mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Create Mission
        </Link>
      )}
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
