"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { RoverPhysics, RoverState } from '@/lib/rover-physics';

interface ManualControlRealtimeProps {
  onTrajectoryUpdate: (trajectory: RoverState[]) => void;
  onReset?: () => void;
  resetVersion?: number;
}

/**
 * The manual palette mirrors the Blockly movement blocks: tap one and the rover
 * runs that instruction for a beat. It is the on-ramp David asked for, so a
 * learner who has never coded sees that blocks drive the rover before they open
 * the full Blockly editor.
 */
type DriveBlock = { command: string; label: string; speed: number; ms: number; icon: string; className: string };

const BLOCKS: DriveBlock[] = [
  { command: 'forward', label: 'Drive forward', speed: 80, ms: 900, icon: '↑', className: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700' },
  { command: 'reverse', label: 'Drive backward', speed: 80, ms: 900, icon: '↓', className: 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700' },
  { command: 'spinLeft', label: 'Spin left', speed: 60, ms: 650, icon: '↺', className: 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700' },
  { command: 'spinRight', label: 'Spin right', speed: 60, ms: 650, icon: '↻', className: 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700' },
  { command: 'steerLeft', label: 'Steer left', speed: 60, ms: 800, icon: '↰', className: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700' },
  { command: 'steerRight', label: 'Steer right', speed: 60, ms: 800, icon: '↱', className: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700' },
];

const KEY_MAP: Record<string, DriveBlock> = {
  w: BLOCKS[0],
  s: BLOCKS[1],
  a: BLOCKS[2],
  d: BLOCKS[3],
  q: BLOCKS[4],
  e: BLOCKS[5],
};

export function ManualControlRealtime({ onTrajectoryUpdate, onReset, resetVersion = 0 }: ManualControlRealtimeProps) {
  const roverRef = useRef<RoverPhysics>(new RoverPhysics());
  const trajectoryRef = useRef<RoverState[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const runTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  const resetController = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (runTimeoutRef.current) {
      clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
    setIsActive(false);
    setActiveCommand(null);
    roverRef.current.reset();
    trajectoryRef.current = [];
  }, []);

  // Listen for external reset from the shared simulator controls.
  useEffect(() => {
    if (resetVersion > 0) {
      resetController();
    }
  }, [resetVersion, resetController]);

  useEffect(() => {
    const updateLoop = () => {
      const newState = roverRef.current.update();
      trajectoryRef.current.push(newState);

      if (trajectoryRef.current.length > 1000) {
        trajectoryRef.current = trajectoryRef.current.slice(-1000);
      }

      onTrajectoryUpdate([...trajectoryRef.current]);
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };

    if (isActive) {
      updateLoop();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, onTrajectoryUpdate]);

  // Tap a block: run that instruction for a beat, then stop. Tapping more blocks
  // extends the path, one block at a time.
  const runBlock = useCallback((block: DriveBlock) => {
    if (!isActive) {
      setIsActive(true);
      trajectoryRef.current = [roverRef.current.getState()];
    }
    if (runTimeoutRef.current) clearTimeout(runTimeoutRef.current);
    roverRef.current.setCommand(block.command, block.speed);
    setActiveCommand(block.command);
    runTimeoutRef.current = setTimeout(() => {
      roverRef.current.setCommand('stop');
      setActiveCommand(null);
      runTimeoutRef.current = null;
    }, block.ms);
  }, [isActive]);

  const stopNow = useCallback(() => {
    if (runTimeoutRef.current) {
      clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
    roverRef.current.setCommand('stop');
    setActiveCommand(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      const block = KEY_MAP[e.key.toLowerCase()];
      if (block) {
        e.preventDefault();
        runBlock(block);
      } else if (e.key === ' ') {
        e.preventDefault();
        stopNow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runBlock, stopNow]);

  const handleReset = () => {
    resetController();
    onReset?.();
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Tap a block to drive</h3>
        <p className="text-xs text-muted-foreground">
          These are the same blocks you code with. Tap one to run it.
        </p>
      </div>

      <div className="grid flex-1 content-start grid-cols-2 gap-2">
        {BLOCKS.map((block) => (
          <button
            key={block.command}
            onClick={() => runBlock(block)}
            className={`flex items-center gap-2 rounded-lg border-l-4 border-black/20 px-3 py-3 text-left text-sm font-bold text-white shadow transition-transform active:scale-[0.98] ${block.className} ${
              activeCommand === block.command ? 'ring-2 ring-white/70' : ''
            }`}
          >
            <span className="text-lg leading-none">{block.icon}</span>
            {block.label}
          </button>
        ))}
        <button
          onClick={stopNow}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg border-l-4 border-black/20 bg-red-600 px-3 py-2.5 text-sm font-bold text-white shadow transition-transform hover:bg-red-500 active:scale-[0.98] active:bg-red-700"
        >
          <span className="text-lg leading-none">■</span> Stop
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleReset}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary"
        >
          Reset position
        </button>
        <span className="text-[11px] text-muted-foreground">Keys: W A S D, Q E, space to stop</span>
      </div>
    </div>
  );
}
