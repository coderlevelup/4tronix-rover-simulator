'use client';

import { useMemo, useEffect, useState } from 'react';
import type { Mission } from '@/core/domain/entities/Mission';

type TrajectoryPoint = {
  x: number;
  y: number;
  heading?: number;
};

type SimulatorInstruction = {
  trajectory?: TrajectoryPoint[];
  final_position?: TrajectoryPoint;
  status?: string;
  error?: string;
};

type SimulatorQueueResponse = {
  status?: string;
  error?: string;
  added?: number;
  instructions?: SimulatorInstruction[];
};

interface SimulatorTrajectoryPanelProps {
  mission: Mission;
  className?: string;
  pollingEnabled?: boolean;
}

function parseSimulatorResponse(consoleOutput?: string): SimulatorQueueResponse | null {
  if (!consoleOutput) {
    return null;
  }

  try {
    return JSON.parse(consoleOutput) as SimulatorQueueResponse;
  } catch {
    return null;
  }
}

function getTrajectoryPoints(response: SimulatorQueueResponse | null): TrajectoryPoint[] {
  const points = response?.instructions?.[0]?.trajectory;

  if (!Array.isArray(points)) {
    return [];
  }

  return points.filter((point): point is TrajectoryPoint => {
    return typeof point?.x === 'number' && typeof point?.y === 'number';
  });
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

export function SimulatorTrajectoryPanel({ mission, className = '', pollingEnabled = false }: SimulatorTrajectoryPanelProps) {
  const [liveTrajectory, setLiveTrajectory] = useState<TrajectoryPoint[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const simulatorResponse = useMemo(
    () => parseSimulatorResponse(mission.executionResult?.consoleOutput),
    [mission.executionResult?.consoleOutput]
  );

  const trajectory = useMemo(() => {
    const points = getTrajectoryPoints(simulatorResponse);
    // Use live trajectory during execution, stored trajectory after completion
    return isExecuting && liveTrajectory.length > 0 ? liveTrajectory : points;
  }, [simulatorResponse, isExecuting, liveTrajectory]);

  // Track execution state
  useEffect(() => {
    setIsExecuting(mission.status === 'processing');
    if (mission.status !== 'processing') {
      setLiveTrajectory([]);
    }
  }, [mission.status]);

  // Poll for trajectory updates during execution
  useEffect(() => {
    if (!pollingEnabled || !isExecuting) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/operator/missions/${mission.id}`);
        const data = await response.json();

        if (data.success && data.mission?.executionResult?.consoleOutput) {
          const partialResponse = parseSimulatorResponse(data.mission.executionResult.consoleOutput);
          const partialPoints = getTrajectoryPoints(partialResponse);
          if (partialPoints.length > 0) {
            setLiveTrajectory(partialPoints);
          }
        }
      } catch (err) {
        console.error('Failed to poll trajectory:', err);
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(pollInterval);
  }, [pollingEnabled, isExecuting, mission.id]);

  const projectedTrajectory = useMemo(() => {
    if (trajectory.length === 0) {
      return [] as Array<{ x: number; y: number }>;
    }

    const canvasWidth = 1000;
    const canvasHeight = 420;
    const padding = 40;

    const xs = trajectory.map((point) => point.x);
    const ys = trajectory.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min(
      (canvasWidth - padding * 2) / spanX,
      (canvasHeight - padding * 2) / spanY
    );

    const projectedWidth = spanX * scale;
    const projectedHeight = spanY * scale;
    const xOffset = (canvasWidth - projectedWidth) / 2;
    const yOffset = (canvasHeight - projectedHeight) / 2;

    return trajectory.map((point) => ({
      x: xOffset + (point.x - minX) * scale,
      y: canvasHeight - (yOffset + (point.y - minY) * scale),
    }));
  }, [trajectory]);

  const pathData = useMemo(() => {
    if (projectedTrajectory.length === 0) {
      return '';
    }

    return projectedTrajectory
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, [projectedTrajectory]);

  const finalPoint = projectedTrajectory.at(-1) ?? null;
  const finalTrajectoryPoint = trajectory.at(-1) ?? null;

  const statusTone = mission.status === 'failed'
    ? 'border-red-500/40 bg-red-500/10 text-red-200'
    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';

  if (!simulatorResponse && trajectory.length === 0) {
    return (
      <div className={`w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-950/90 p-6 shadow-2xl ${className}`}>
        <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/60">
          <div className="text-center space-y-2 px-6">
            {isExecuting ? (
              <>
                <div className="relative mx-auto h-12 w-12 mb-4">
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500"></div>
                </div>
                <p className="text-lg font-semibold text-orange-400 animate-pulse">Drawing trajectory...</p>
                <p className="text-sm text-slate-500">
                  Rover is executing. Trajectory will appear in real-time.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-200">No simulator data yet</p>
                <p className="text-sm text-slate-500">
                  Execute the mission to render the rover trajectory here.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-950/90 shadow-2xl ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            Simulator Render
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Mission trajectory</h2>
        </div>

        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          isExecuting
            ? 'border-orange-500/30 bg-orange-500/10 text-orange-400 animate-pulse'
            : statusTone
        }`}>
          {isExecuting
            ? 'Drawing in real-time...'
            : mission.status === 'failed'
              ? 'Execution failed'
              : 'Execution complete'}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.12),_transparent_55%)] p-4 sm:p-6">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <svg viewBox="0 0 1000 420" className="h-[420px] w-full bg-slate-950">
              <defs>
                <pattern id="sim-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                </pattern>
                <linearGradient id="sim-path" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>

              <rect x="0" y="0" width="100%" height="100%" fill="url(#sim-grid)" />

              {pathData && (
                <path
                  d={pathData}
                  fill="none"
                  stroke="url(#sim-path)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {trajectory.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={projectedTrajectory[index]?.x ?? 0}
                  cy={projectedTrajectory[index]?.y ?? 0}
                  r={index === trajectory.length - 1 ? 4.5 : 2.5}
                  fill={index === trajectory.length - 1 ? '#f97316' : '#94a3b8'}
                  opacity={index === trajectory.length - 1 ? 1 : 0.8}
                />
              ))}

              {finalPoint && (
                <g transform={`translate(${finalPoint.x}, ${finalPoint.y})`}>
                  <circle r="8" fill="#fb923c" opacity="0.18" />
                  <circle r="5" fill="#fb923c" />
                </g>
              )}
            </svg>
          </div>
        </div>

        <div className="border-t border-slate-800 px-6 py-5 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Points</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{trajectory.length}</p>
            </div>

            {finalTrajectoryPoint && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Final Position</p>
                <p className="mt-1 text-sm text-slate-300">
                  X {formatCoordinate(finalTrajectoryPoint.x)} / Y {formatCoordinate(finalTrajectoryPoint.y)}
                </p>
                {typeof finalTrajectoryPoint.heading === 'number' && (
                  <p className="mt-1 text-sm text-slate-400">
                    Heading {formatCoordinate(finalTrajectoryPoint.heading)}°
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Execution Status</p>
              <div className="mt-1 text-sm">
                {isExecuting ? (
                  <p className="text-orange-400 font-medium animate-pulse">● Running...</p>
                ) : mission.status === 'completed' ? (
                  <p className="text-green-400 font-medium">✓ Completed successfully</p>
                ) : mission.status === 'failed' ? (
                  <p className="text-red-400 font-medium">✗ Failed</p>
                ) : (
                  <p className="text-slate-400">Pending</p>
                )}
              </div>
            </div>

            {mission.executionResult?.errorMessage && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">Error</p>
                <p className="mt-1 whitespace-pre-wrap text-red-100/80">{mission.executionResult.errorMessage}</p>
              </div>
            )}

            {mission.startedAt && mission.completedAt && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Duration</p>
                <p className="mt-1 text-sm text-slate-300">
                  {Math.round((new Date(mission.completedAt).getTime() - new Date(mission.startedAt).getTime()) / 1000)}s
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}