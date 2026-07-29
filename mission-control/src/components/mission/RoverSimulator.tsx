'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeLayout,
  drawSimFrame,
  interpolate,
  SIM_FPS,
  type SimLayout,
} from '@/lib/roverSimRender';

interface TrajectoryPoint {
  x: number;
  y: number;
  heading: number;
  speedL: number;
  speedR: number;
  servos: Record<string, number>;
}

interface RoverSimulatorProps {
  trajectory: TrajectoryPoint[];
  isPlaying: boolean;
  onReset?: () => void;
  editorMode?: 'manual' | 'blockly' | 'code';
  resetVersion?: number;
  /**
   * Rendered inside this card, below the playback controls. A slot rather than
   * anything simulator-specific: the arena is drawn letterboxed with vertical
   * slack, which makes this the cheapest place on the page to spend height.
   * The simulator does not need to know what goes in it.
   */
  footer?: React.ReactNode;
}

export function RoverSimulator({
  trajectory = [],
  isPlaying = false,
  onReset,
  editorMode,
  resetVersion = 0,
  footer,
}: RoverSimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trajRef = useRef<TrajectoryPoint[]>(trajectory);
  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const sizeRef = useRef<SimLayout & { dpr: number }>({ w: 0, h: 0, s: 1, ox: 0, oy: 0, dpr: 1 });

  const isManual = editorMode === 'manual';
  const [isPaused, setIsPaused] = useState(false);
  const [hud, setHud] = useState({ x: 0, y: 0, heading: 0, frame: 0, total: 0 });

  // Keep the latest trajectory available to the rAF loop (which reads it live)
  // without re-subscribing every frame. Runs before the draw effects below.
  useEffect(() => {
    trajRef.current = trajectory;
  });

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const L = sizeRef.current;
    if (L.w === 0) return;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const traj = trajRef.current;
    const playhead = isManual ? Math.max(0, traj.length - 1) : playheadRef.current;
    drawSimFrame(ctx, L, traj, playhead);
  }, [isManual]);

  // --- Sizing (crisp on HiDPI) --------------------------------------------

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(0, rect.width);
    const h = Math.max(0, rect.height);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    sizeRef.current = { ...computeLayout(w, h), dpr };
    drawScene();
  }, [drawScene]);

  useEffect(() => {
    resize();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [resize]);

  // --- HUD + playback ------------------------------------------------------

  const syncHud = useCallback(() => {
    const traj = trajRef.current;
    if (traj.length === 0) {
      setHud({ x: 0, y: 0, heading: 0, frame: 0, total: 0 });
      return;
    }
    const playhead = isManual ? traj.length - 1 : playheadRef.current;
    const st = interpolate(traj, playhead);
    setHud({
      x: st.x,
      y: st.y,
      heading: ((st.heading % 360) + 360) % 360,
      frame: Math.round(playhead) + 1,
      total: traj.length,
    });
  }, [isManual]);

  // Continuous rAF only while a non-manual run is actively playing.
  useEffect(() => {
    if (isManual || isPaused || !isPlaying) return;
    if (trajectory.length === 0) return;

    let lastHudFrame = -1;
    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;

      const len = trajRef.current.length;
      let p = playheadRef.current + dt * SIM_FPS;
      if (p >= len - 1) p = len - 1;
      playheadRef.current = p;

      drawScene();
      const f = Math.round(p);
      if (f !== lastHudFrame) {
        lastHudFrame = f;
        syncHud();
      }

      if (p < len - 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isManual, isPaused, isPlaying, trajectory.length, drawScene, syncHud]);

  // A fresh non-manual run starts from the beginning and plays.
  useEffect(() => {
    if (isManual) return;
    playheadRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart playback when a new trajectory arrives (external event)
    setIsPaused(false);
    drawScene();
    syncHud();
  }, [trajectory, isManual, drawScene, syncHud]);

  // Manual mode is live: keep the rover on the newest point as it streams in.
  useEffect(() => {
    if (!isManual) return;
    playheadRef.current = Math.max(0, trajectory.length - 1);
    drawScene();
    syncHud();
  }, [isManual, trajectory, drawScene, syncHud]);

  // External reset (shared simulator controls) parks the view at the start.
  useEffect(() => {
    if (resetVersion === 0) return;
    playheadRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- react to the shared reset signal from the workspace controls
    setIsPaused(true);
    drawScene();
    syncHud();
  }, [resetVersion, drawScene, syncHud]);

  const handleScrub = (value: number) => {
    setIsPaused(true);
    playheadRef.current = value;
    drawScene();
    syncHud();
  };

  const handlePlayPause = () => {
    const len = trajRef.current.length;
    if (isPaused && playheadRef.current >= len - 1) {
      playheadRef.current = 0; // restart if parked at the end
    }
    lastTsRef.current = null;
    setIsPaused((p) => !p);
  };

  const handleReset = () => {
    onReset?.();
    playheadRef.current = 0;
    setIsPaused(true);
    drawScene();
    syncHud();
  };

  const hasTrajectory = trajectory.length > 0;

  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 p-3 clay">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-block-move" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Simulator</p>
        </div>
        {hasTrajectory && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <Chip label="X" value={`${hud.x.toFixed(0)}`} />
            <Chip label="Y" value={`${hud.y.toFixed(0)}`} />
            <Chip label="°" value={`${hud.heading.toFixed(0)}`} />
          </div>
        )}
      </div>

      <div
        ref={wrapRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-border bg-[#1a0f0a]"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
        {!hasTrajectory && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
            <p className="text-xs font-semibold text-white/80">
              Tap a block or press Run to move your rover
            </p>
          </div>
        )}
      </div>

      {hasTrajectory && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, trajectory.length - 1)}
            value={Math.min(Math.max(0, hud.frame - 1), Math.max(0, trajectory.length - 1))}
            onChange={(e) => handleScrub(parseInt(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-primary"
            aria-label="Scrub simulation frame"
          />
          <div className="flex items-center gap-2">
            {!isManual && (
              <button
                onClick={handlePlayPause}
                className={`clay-press flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  isPaused
                    ? 'bg-gradient-mars text-primary-foreground'
                    : 'border border-border bg-secondary text-foreground'
                }`}
              >
                {isPaused ? (
                  <>
                    <PlayIcon /> Play
                  </>
                ) : (
                  <>
                    <PauseIcon /> Pause
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleReset}
              className={`clay-press flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition-colors ${
                isManual ? 'w-full' : 'flex-1'
              }`}
            >
              <ResetIcon /> Reset
            </button>
          </div>
        </div>
      )}

      {footer}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/50 px-1.5 py-0.5">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 00-14.32-3.5M4 14a8 8 0 0014.32 3.5" />
    </svg>
  );
}
