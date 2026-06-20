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
    <main className="relative min-h-screen overflow-hidden pb-32">
      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-8 pb-12">
        <div className="text-center space-y-6">
          <div className="inline-flex animate-float items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.28em] text-primary shadow-glow-mars">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Mission Control · Online
          </div>

          <h1 className="font-display text-5xl font-extrabold leading-[1.05] text-foreground md:text-7xl">
            Discover New <span className="text-gradient-mars">Mars Missions!</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Explore completed rover missions from cadets around the world. Watch, learn, and create your own!
          </p>
        </div>
      </section>

      {/* Missions Grid */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-12">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/25 border-t-primary" />
            </div>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="mt-4 font-display text-lg font-bold text-destructive">Unable to load missions</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-glow-mars transition-transform hover:-translate-y-0.5"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        ) : missions.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-xl font-bold text-foreground">No missions yet</p>
            <p className="mt-2 text-muted-foreground">Completed missions will appear here soon.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {missions.map((mission) => {
              const videoUrl = mission.youtubeUrl || mission.videoUrl;
              const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

              return (
                <article
                  key={mission.id}
                  className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/40 shadow-card backdrop-blur-xl"
                >
                  {/* Mission Header */}
                  <div className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl shadow-lg">
                      <Image
                        src="/rover-hero.jpg"
                        alt="Rover avatar"
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                      {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                    </h2>
                  </div>

                  {/* Mission Content: Code | Video */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/50">
                    {/* Code Panel */}
                    <div className="p-6 space-y-3">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                        Mission Code
                      </p>
                      <pre className="overflow-auto rounded-2xl bg-background/80 border border-border/60 p-4 text-sm leading-relaxed text-foreground max-h-[400px] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        <code>{mission.code.trim() || '// No code'}</code>
                      </pre>
                    </div>

                    {/* Center CTA Button */}
                    <div className="flex items-center justify-center p-6 lg:p-4">
                      <Link
                        href={`/mission?id=${mission.id}`}
                        className="group flex flex-col items-center gap-3 text-center transition-transform hover:scale-105"
                      >
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-mars shadow-glow-mars transition-transform group-hover:rotate-12">
                          <svg
                            className="h-7 w-7 text-primary-foreground transition-transform group-hover:translate-x-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <p className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                          Try It Yourself!
                        </p>
                      </Link>
                    </div>

                    {/* Video Panel */}
                    <div className="p-6 space-y-3 flex flex-col">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
                        Mission Replay
                      </p>
                      {embedUrl ? (
                        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black border border-border/60 shadow-lg flex-1">
                          <iframe
                            src={embedUrl}
                            title={`${mission.name || 'Mission'} video`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="absolute inset-0 h-full w-full"
                          />
                          {/* Play button overlay visual hint */}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 shadow-glow-mars backdrop-blur-sm">
                              <svg className="h-10 w-10 text-primary-foreground ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-background/40 py-12">
                          <div className="text-center">
                            <svg className="mx-auto h-10 w-10 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <p className="mt-3 text-sm text-muted-foreground">No video available</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Sticky Bottom CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-primary animate-blast" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="font-display text-base font-semibold text-foreground">
                Ready to create your own mission?{' '}
                <span className="text-primary">Launch the editor</span> and bring your ideas to life!
              </p>
            </div>
            <Link
              href="/mission"
              className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-mars px-6 py-3 font-display text-base font-bold text-primary-foreground shadow-glow-mars transition-transform hover:-translate-y-0.5"
            >
              <svg className="h-5 w-5 animate-blast" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Create Mission
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
