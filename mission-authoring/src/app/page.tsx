'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mission } from '@/core/domain/entities/Mission';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  }
  return null;
}

export default function LandingPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMissions = async () => {
      const timeoutId = setTimeout(() => {
        console.warn('[Landing] Mission loading is taking longer than expected (>10s)');
      }, 10000);

      try {
        console.log('[Landing] Starting to load missions...');
        console.log('[Landing] Current origin:', window.location.origin);

        const repository = new FirestoreMissionRepository(getFirestoreClient());
        console.log('[Landing] Repository created, fetching missions...');

        const loadedMissions = await repository.findAll();
        console.log('[Landing] Loaded missions:', loadedMissions.length);

        const completedMissions = loadedMissions
          .filter((m) => m.status === 'completed' && (m.videoUrl || m.youtubeUrl))
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          .slice(0, 10);

        console.log('[Landing] Completed missions with videos:', completedMissions.length);
        setMissions(completedMissions);
        setError(null);
      } catch (err) {
        console.error('[Landing] Failed to load missions:', err);
        let errorMessage = 'Failed to load missions. ';

        if (err instanceof Error) {
          errorMessage += err.message;
          // Check for common Firebase errors
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

  return (
    <main className="relative min-h-screen pb-28">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-8 text-center">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
          Mission Control
        </p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">
          Mars Mission <span className="text-gradient-mars">Feed</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
          Watch completed rover missions from cadets around the world — then build your own.
        </p>
      </section>

      {/* Feed */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
            <h3 className="font-display text-lg font-bold text-destructive">Unable to load missions</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Retry
            </button>
          </div>
        ) : missions.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-xl font-bold text-foreground">No missions yet</p>
            <p className="mt-2 text-muted-foreground">Completed missions will appear here soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {missions.map((mission) => {
              const videoUrl = mission.youtubeUrl || mission.videoUrl;
              const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

              return (
                <article
                  key={mission.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-colors hover:border-border"
                >
                  {/* Video — the YouTube-style thumbnail/player up top */}
                  <div className="relative aspect-video w-full bg-black">
                    {embedUrl ? (
                      <iframe
                        src={embedUrl}
                        title={`${mission.name || 'Mission'} video`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <p className="mt-2 text-xs">No video available</p>
                      </div>
                    )}
                  </div>

                  {/* Meta row: avatar + title + date (left), Try-it action in the corner */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                        <Image
                          src="/rover-hero.jpg"
                          alt="Rover avatar"
                          width={72}
                          height={72}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-base font-bold text-foreground">
                          {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mission.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/mission?id=${mission.id}`}
                      className="shrink-0 rounded-full bg-gradient-mars px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                    >
                      Try it yourself →
                    </Link>
                  </div>

                  {/* Code (kept visible alongside the video, scrollable) */}
                  <div className="border-t border-border/50 px-4 py-3">
                    <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Mission code
                    </p>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-background/80 p-3 text-xs leading-relaxed text-foreground">
                      <code>{mission.code.trim() || '// No code'}</code>
                    </pre>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Sticky bottom CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <p className="hidden font-display text-sm font-semibold text-foreground sm:block">
            Ready to create your own mission?
          </p>
          <Link
            href="/mission"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-mars px-6 py-2.5 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Create Mission
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
