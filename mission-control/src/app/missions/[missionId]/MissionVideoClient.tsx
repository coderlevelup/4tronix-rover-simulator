"use client";

import { useEffect, useMemo, useState } from 'react';
import { Mission } from '@/core/domain/entities/Mission';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { RoverSimulatorScaffold } from '@/components/mission/RoverSimulatorScaffold';
import { BlocklyViewer } from '@/components/mission/BlocklyViewer';
import { parseRoverCode } from '@/lib/parseRoverCode';
import { simulateCommands } from '@/lib/simulateCommands';
import { getDiscoveryStatus, DISCOVERY_BADGE_CLASS } from '@/lib/discoveryStatus';

function getYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

type RunOption = { id: string; label: string; kind: 'sim' | 'real'; youtubeId?: string };

export default function MissionVideoClient({ missionId }: { missionId: string }) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('sim');
  const [codeView, setCodeView] = useState<'blocks' | 'python'>('blocks');
  const [copied, setCopied] = useState(false);

  // The simulated run is reproducible from the mission's code, so it is computed
  // on demand rather than stored. Keeps hosting cheap and always in sync.
  const simTrajectory = useMemo(
    () => (mission ? simulateCommands(parseRoverCode(mission.code)) : []),
    [mission]
  );

  // Run selector entries: the simulated run is always present; real yard runs
  // are added as they are attached. A dropdown handles any number of runs.
  const runs = useMemo<RunOption[]>(() => {
    const list: RunOption[] = [{ id: 'sim', label: 'Simulated run', kind: 'sim' }];
    const realId = getYouTubeId(mission?.youtubeUrl || mission?.videoUrl);
    if (realId) list.push({ id: 'real-1', label: 'Real run', kind: 'real', youtubeId: realId });
    return list;
  }, [mission]);

  useEffect(() => {
    const fetchMission = async () => {
      try {
        const repository = new FirestoreMissionRepository(getFirestoreClient());
        const loadedMission = await repository.findById(missionId);
        if (loadedMission) setMission(loadedMission);
        else setError('Mission not found');
      } catch (err) {
        console.error('Fetch mission error:', err);
        setError('Failed to load mission');
      } finally {
        setLoading(false);
      }
    };
    void fetchMission();
  }, [missionId]);

  if (loading) {
    return (
      <main className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
      </main>
    );
  }

  if (error || !mission) {
    return (
      <main className="mx-auto flex h-[calc(100vh-64px)] max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="text-4xl">⚠️</span>
        <h1 className="mt-4 font-display text-2xl font-bold text-foreground">Mission not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error || 'We could not load this mission.'}</p>
        <Link
          href="/"
          className="mt-6 rounded-xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Back to the feed
        </Link>
      </main>
    );
  }

  const missionName = mission.name || `Mission ${mission.id.slice(0, 8)}`;
  const discoveryStatus = getDiscoveryStatus(mission.status);
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const durationMs = mission.executionMetadata?.duration_ms;
  const durationLabel = durationMs ? `${Math.round(durationMs / 1000)}s` : '—';
  const executionLabel = mission.executionResult?.isSuccessful
    ? 'Successful'
    : mission.executionResult
      ? 'Failed'
      : 'Not run';
  const dateLabel = new Date(mission.completedAt || mission.submittedAt).toLocaleDateString();
  const hasBlocks = !!mission.blocklyState;
  const showBlocks = hasBlocks && codeView === 'blocks';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(mission.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <main className="h-[calc(100vh-64px)] overflow-hidden px-3 py-2">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-2">
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="shrink-0 text-muted-foreground transition-colors hover:text-primary" aria-label="Back to the feed">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="truncate font-display text-lg font-bold text-foreground md:text-xl">{missionName}</h1>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${DISCOVERY_BADGE_CLASS[discoveryStatus]}`}
            >
              {discoveryStatus}
            </span>
            <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
              {mission.yardId} · {dateLabel}
            </span>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            Run
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Body fills the remaining viewport height; nothing scrolls except the code */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
          {/* Footage (sized to fit) + stats */}
          <div className="flex min-h-0 flex-col gap-2 lg:col-span-2">
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/30">
              {selectedRun.kind === 'real' && selectedRun.youtubeId ? (
                <div className="flex h-full w-full items-center justify-center p-2">
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <iframe
                      src={`https://www.youtube.com/embed/${selectedRun.youtubeId}?rel=0`}
                      title={missionName}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full border-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full w-full p-2">
                  <RoverSimulatorScaffold trajectory={simTrajectory} isPlaying editorMode="code" />
                </div>
              )}
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-2">
              <Stat label="Status" value={discoveryStatus} />
              <Stat label="Duration" value={durationLabel} mono />
              <Stat label="Execution" value={executionLabel} />
            </div>
          </div>

          {/* Code (scrolls internally) + remix */}
          <div className="flex min-h-0 flex-col gap-2 lg:col-span-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/60">
              <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
                {hasBlocks ? (
                  <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs font-semibold">
                    <button
                      onClick={() => setCodeView('blocks')}
                      className={`rounded-md px-3 py-1 transition-colors ${showBlocks ? 'bg-gradient-mars text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Blocks
                    </button>
                    <button
                      onClick={() => setCodeView('python')}
                      className={`rounded-md px-3 py-1 transition-colors ${showBlocks ? 'text-muted-foreground hover:text-foreground' : 'bg-gradient-mars text-primary-foreground'}`}
                    >
                      Python
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400/70" />
                    <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                    <span className="h-2 w-2 rounded-full bg-green-400/70" />
                    <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      mission.py
                    </span>
                  </div>
                )}
                <button
                  onClick={copyCode}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? 'Copied' : 'Copy Python'}
                </button>
              </div>
              {showBlocks ? (
                <div className="min-h-0 flex-1">
                  <BlocklyViewer state={mission.blocklyState!} />
                </div>
              ) : (
                <pre className="min-h-0 flex-1 overflow-auto p-4 text-xs leading-relaxed text-foreground">
                  <code>{mission.code.trim() || '# No code'}</code>
                </pre>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent px-4 py-3">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-foreground">Like this mission?</h3>
                <p className="truncate text-xs text-muted-foreground">Remix it: tweak the code and run your own version.</p>
              </div>
              <button
                onClick={() => {
                  // Remix into the workspace: carry blocks for block-built missions,
                  // otherwise the Python, and open the matching editor mode.
                  if (mission.blocklyState) {
                    localStorage.setItem('roverWorkspace', mission.blocklyState);
                    window.location.href = '/mission?mode=blockly';
                  } else {
                    localStorage.setItem('rover_monaco_code', mission.code);
                    window.location.href = '/mission?mode=code';
                  }
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-mars px-4 py-2 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Try it
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
