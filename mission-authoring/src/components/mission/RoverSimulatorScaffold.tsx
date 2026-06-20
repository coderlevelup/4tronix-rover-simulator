'use client';

import { useEffect, useRef, useState } from 'react';

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
  simVideoUrl?: string | null;
  simVideoLoading?: boolean;
}

export function RoverSimulatorScaffold({ trajectory = [], isPlaying = false, onReset, editorMode, resetVersion = 0, simVideoUrl, simVideoLoading }: RoverSimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const terrainImageRef = useRef<HTMLImageElement | null>(null);
  const [terrainLoaded, setTerrainLoaded] = useState(false);
  const previousTrajectoryLengthRef = useRef(0);

  // Canvas dimensions
  const CANVAS_SIZE = 600;
  const YARD_WIDTH_CM = 400;
  const YARD_HEIGHT_CM = 300;
  const SCALE = CANVAS_SIZE / YARD_WIDTH_CM;

  // Load terrain image
  useEffect(() => {
    const terrainImg = new Image();
    terrainImg.src = '/terrain.jpg';
    terrainImg.onload = () => {
      terrainImageRef.current = terrainImg;
      setTerrainLoaded(true);
    };
    terrainImg.onerror = () => {
      console.error('Failed to load terrain.jpg');
      setTerrainLoaded(false);
    };
  }, []);

  // Real-time snapping: only when trajectory is actively growing
  useEffect(() => {
    // Paused state always wins - don't auto-snap when user has paused
    if (isPaused) return;
    if (trajectory.length === 0) return;

    const trajectoryGrew = trajectory.length > previousTrajectoryLengthRef.current;
    previousTrajectoryLengthRef.current = trajectory.length;

    // Only snap to latest if trajectory just grew significantly (real-time streaming)
    if (trajectoryGrew && trajectory.length > currentFrame + 5 && isPlaying) {
      setCurrentFrame(trajectory.length - 1);
    }
  }, [trajectory.length, isPaused, isPlaying, currentFrame]);

  // Manual mode is live-rendered: keep the rover parked on the newest point,
  // but let reset freeze the view at frame 0 without clearing the trail.
  useEffect(() => {
    if (editorMode !== 'manual') return;
    if (trajectory.length === 0) return;

    setCurrentFrame(trajectory.length - 1);
  }, [editorMode, trajectory.length]);

  useEffect(() => {
    if (editorMode !== 'manual') return;
    if (resetVersion === 0) return;

    setCurrentFrame(0);
    setIsPaused(true);
  }, [editorMode, resetVersion]);

  // Auto-advance frames when playing
  useEffect(() => {
    if (trajectory.length === 0) return;
    if (editorMode === 'manual') return;
    if (isPaused) return;
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= trajectory.length - 1) {
          return trajectory.length - 1;
        }
        return prev + 1;
      });
    }, 100); // 10 FPS

    return () => clearInterval(interval);
  }, [editorMode, isPlaying, trajectory.length, isPaused]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw terrain background
    if (terrainImageRef.current && terrainLoaded) {
      ctx.drawImage(terrainImageRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      // Fallback: brown dirt
      ctx.fillStyle = '#634200';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // Draw grid lines (semi-transparent over terrain)
    ctx.strokeStyle = 'rgba(139, 105, 20, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= YARD_WIDTH_CM; i += 50) {
      const x = i * SCALE;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_SIZE);
      ctx.stroke();
    }
    for (let i = 0; i <= YARD_HEIGHT_CM; i += 50) {
      const y = CANVAS_SIZE - i * SCALE;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_SIZE, y);
      ctx.stroke();
    }

    // If no trajectory, show empty state
    if (trajectory.length === 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click "Run Demo" to see the rover move', CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      return;
    }

    const trailEndIndex = editorMode === 'manual' ? trajectory.length - 1 : currentFrame;

    // Draw trajectory trail only up to the active playback frame.
    if (trajectory.length > 1 && trailEndIndex > 0) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const endIndex = Math.floor(trailEndIndex);
      for (let i = 0; i <= endIndex && i < trajectory.length; i++) {
        const point = trajectory[i];
        if (!point) continue; // Skip undefined points

        const x = (point.x + YARD_WIDTH_CM / 2) * SCALE;
        const y = CANVAS_SIZE - (point.y + YARD_HEIGHT_CM / 2) * SCALE;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw current rover
    const state = trajectory[currentFrame];
    if (!state) return; // No valid state to draw
    const roverX = (state.x + YARD_WIDTH_CM / 2) * SCALE;
    const roverY = CANVAS_SIZE - (state.y + YARD_HEIGHT_CM / 2) * SCALE;

    ctx.save();
    ctx.translate(roverX, roverY);
    ctx.rotate((state.heading * Math.PI) / 180);

    // Draw detailed rover
    const roverSize = 40;

    // Main body (rectangular chassis)
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.fillRect(-roverSize/2, -roverSize/2, roverSize, roverSize);
    ctx.strokeStyle = '#475569'; // slate-600
    ctx.lineWidth = 2;
    ctx.strokeRect(-roverSize/2, -roverSize/2, roverSize, roverSize);

    // Solar panel (blue rectangle on top)
    ctx.fillStyle = '#3b82f6'; // blue-500
    ctx.fillRect(-roverSize/2 + 5, -roverSize/2 + 5, roverSize - 10, roverSize/2 - 5);
    ctx.strokeStyle = '#1d4ed8'; // blue-700
    ctx.lineWidth = 1;
    ctx.strokeRect(-roverSize/2 + 5, -roverSize/2 + 5, roverSize - 10, roverSize/2 - 5);

    // Wheels (6 small circles)
    ctx.fillStyle = '#1e293b'; // slate-900
    const wheelSize = 6;
    const wheelPositions = [
      [-roverSize/2 - 3, -roverSize/2 + 5],
      [-roverSize/2 - 3, 0],
      [-roverSize/2 - 3, roverSize/2 - 5],
      [roverSize/2 + 3, -roverSize/2 + 5],
      [roverSize/2 + 3, 0],
      [roverSize/2 + 3, roverSize/2 - 5],
    ];
    wheelPositions.forEach(([wx, wy]) => {
      ctx.beginPath();
      ctx.arc(wx, wy, wheelSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Camera/antenna (small circle at front)
    ctx.fillStyle = '#ef4444'; // red-500
    ctx.beginPath();
    ctx.arc(roverSize/2 + 5, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (small line pointing forward)
    ctx.strokeStyle = '#fbbf24'; // amber-400
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roverSize/2, 0);
    ctx.lineTo(roverSize/2 + 12, 0);
    ctx.stroke();

    ctx.restore();

    // Draw info
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`x: ${state.x.toFixed(1)} cm`, 10, 20);
    ctx.fillText(`y: ${state.y.toFixed(1)} cm`, 10, 40);
    ctx.fillText(`heading: ${state.heading.toFixed(1)}°`, 10, 60);
    ctx.fillText(`frame: ${currentFrame + 1}/${trajectory.length}`, 10, 80);
  }, [trajectory, currentFrame, CANVAS_SIZE, YARD_WIDTH_CM, YARD_HEIGHT_CM, SCALE, terrainLoaded]);

  const handleReset = () => {
    // Delegate reset to the parent so each editor mode can decide whether
    // to clear the trajectory or preserve the manual trail.
    if (onReset) {
      onReset();
    }
    setCurrentFrame(0);
    setIsPaused(true);
  };

  const handlePlayPause = () => {
    setIsPaused(!isPaused);
  };

  // Reset isPaused when new trajectory starts
  useEffect(() => {
    if (trajectory.length > 0 && isPlaying) {
      setIsPaused(false);
    }
  }, [trajectory.length, isPlaying]);

  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
          Simulator
        </p>
      </div>

      {/* Sim video player — shown when a video capture is available */}
      {simVideoLoading && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-900 py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-orange-400" />
          <span className="text-sm text-slate-400">Rendering simulation video…</span>
        </div>
      )}

      {simVideoUrl && !simVideoLoading && (
        <div className="w-full rounded-xl border border-slate-700 overflow-hidden bg-black">
          <video
            src={simVideoUrl}
            controls
            autoPlay
            loop
            className="w-full"
            style={{ maxWidth: '100%', height: 'auto', aspectRatio: '1', display: 'block' }}
          />
        </div>
      )}

      {/* Canvas trajectory — shown when no video is available */}
      {!simVideoUrl && !simVideoLoading && (
        <div className="w-full rounded-xl border border-slate-700 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full"
            style={{ maxWidth: '100%', height: 'auto', aspectRatio: '1', display: 'block' }}
          />
        </div>
      )}

      {trajectory.length > 0 && !simVideoUrl && !simVideoLoading && (
        <div className="flex flex-col gap-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, trajectory.length - 1)}
            value={currentFrame}
            onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
            className="w-full h-1.5"
          />
          <div className="flex gap-2">
            {editorMode !== 'manual' && (
              <button
                onClick={handlePlayPause}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isPaused
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600'
                    : 'bg-green-600 text-white hover:bg-green-700 disabled:hover:bg-green-600'
                }`}
              >
                {isPaused ? 'Play' : 'Pause'}
              </button>
            )}
            <button
              onClick={handleReset}
              className={`rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600 transition-colors ${
                editorMode === 'manual' ? 'w-full' : 'flex-1'
              }`}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
