"use client";

import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import styles from './ManualControlRealtime.module.css';
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
type DriveBlock = { command: string; label: string; speed: number; ms: number; colour: string };

// Labels and colours mirror the real Blockly movement blocks, so a learner sees
// the same Lego pieces here as in the editor (movement blue, spin purple,
// steer cyan, stop red).
const BLOCKS: DriveBlock[] = [
  { command: 'forward', label: 'Move Forward', speed: 80, ms: 1000, colour: '#2196F3' },
  { command: 'reverse', label: 'Move Backward', speed: 80, ms: 1000, colour: '#2196F3' },
  { command: 'spinLeft', label: 'Spin Left', speed: 60, ms: 500, colour: '#9C27B0' },
  { command: 'spinRight', label: 'Spin Right', speed: 60, ms: 500, colour: '#9C27B0' },
  { command: 'steerLeft', label: 'Steer Left', speed: 60, ms: 1000, colour: '#00BCD4' },
  { command: 'steerRight', label: 'Steer Right', speed: 60, ms: 1000, colour: '#00BCD4' },
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

      <div className="grid flex-1 content-start grid-cols-2 gap-x-3 gap-y-4">
        {BLOCKS.map((block) => (
          <button
            key={block.command}
            onClick={() => runBlock(block)}
            className={`${styles.block} ${activeCommand === block.command ? styles.active : ''}`}
            style={{ ['--c']: block.colour } as CSSProperties}
          >
            {block.label}
          </button>
        ))}
        <button
          onClick={stopNow}
          className={`${styles.block} col-span-2 justify-center`}
          style={{ ['--c']: '#f44336' } as CSSProperties}
        >
          Stop
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
