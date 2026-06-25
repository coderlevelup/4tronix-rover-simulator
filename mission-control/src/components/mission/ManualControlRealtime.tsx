"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './ManualControlRealtime.module.css';
import { RoverPhysics, RoverState } from '@/lib/rover-physics';

interface ManualControlRealtimeProps {
  onTrajectoryUpdate: (trajectory: RoverState[]) => void;
  onReset?: () => void;
  resetVersion?: number;
}

export function ManualControlRealtime({ onTrajectoryUpdate, onReset, resetVersion = 0 }: ManualControlRealtimeProps) {
  const roverRef = useRef<RoverPhysics>(new RoverPhysics());
  const trajectoryRef = useRef<RoverState[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const resetController = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsActive(false);
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
    // Start real-time physics loop
    const updateLoop = () => {
      const newState = roverRef.current.update();
      trajectoryRef.current.push(newState);

      // Keep only last 1000 points to prevent memory issues
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

  const handleCommand = useCallback((command: string, speed?: number) => {
    if (!isActive) {
      // First command - start the loop
      setIsActive(true);
      trajectoryRef.current = [roverRef.current.getState()];
    }
    roverRef.current.setCommand(command, speed || 80);
  }, [isActive]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;

      switch (e.key.toLowerCase()) {
        case 'w': handleCommand('forward', 80); break;
        case 's': handleCommand('reverse', 80); break;
        case 'a': handleCommand('spinLeft', 60); break;
        case 'd': handleCommand('spinRight', 60); break;
        case 'q': handleCommand('steerLeft', 60); break;
        case 'e': handleCommand('steerRight', 60); break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'w':
        case 's':
        case 'a':
        case 'd':
        case 'q':
        case 'e':
          handleCommand('stop');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleCommand]);

  const handleReset = () => {
    resetController();
    onReset?.();
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4 h-full w-full relative">
      <h3 className="text-lg font-semibold text-slate-200">Manual Controls (Real-time)</h3>

      {/* Direction Controls Grid */}
      <div className={`grid w-full grid-cols-3 gap-3 flex-1 ${styles.autoRowsFr}`}>
        {/* Row 1 */}
        <button
          onMouseDown={() => handleCommand('steerLeft', 60)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-blue-600 px-3 text-lg font-semibold text-white hover:bg-blue-500 active:bg-blue-700"
        >
          ↰ Steer Left
        </button>
        <button
          onMouseDown={() => handleCommand('forward', 80)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-emerald-600 px-3 text-lg font-semibold text-white hover:bg-emerald-500 active:bg-emerald-700"
        >
          ↑ Forward
        </button>
        <button
          onMouseDown={() => handleCommand('steerRight', 60)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-blue-600 px-3 text-lg font-semibold text-white hover:bg-blue-500 active:bg-blue-700"
        >
          ↱ Steer Right
        </button>

        {/* Row 2 */}
        <button
          onMouseDown={() => handleCommand('spinLeft', 60)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-purple-600 px-3 text-lg font-semibold text-white hover:bg-purple-500 active:bg-purple-700"
        >
          ↺ Spin Left
        </button>
        <button
          onClick={() => handleCommand('stop', 0)}
          className="w-full h-full rounded-xl bg-red-600 px-3 text-lg font-semibold text-white hover:bg-red-500"
        >
          ■ Stop
        </button>
        <button
          onMouseDown={() => handleCommand('spinRight', 60)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-purple-600 px-3 text-lg font-semibold text-white hover:bg-purple-500 active:bg-purple-700"
        >
          ↻ Spin Right
        </button>

        {/* Row 3 */}
        <div />
        <button
          onMouseDown={() => handleCommand('reverse', 80)}
          onMouseUp={() => handleCommand('stop')}
          onMouseLeave={() => handleCommand('stop')}
          className="w-full h-full rounded-xl bg-orange-600 px-3 text-lg font-semibold text-white hover:bg-orange-500 active:bg-orange-700"
        >
          ↓ Reverse
        </button>
        <div />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleReset}
          className="rounded-lg bg-slate-700 px-6 py-3 text-base font-medium text-white hover:bg-slate-600"
        >
          Reset Position
        </button>
      </div>

      <p className="px-2 text-center text-sm text-slate-400">Hold buttons to drive, release to stop.</p>

      {/* Keyboard Tooltip */}
      <div className="absolute bottom-4 left-4 text-xs text-slate-400 bg-slate-800/80 p-2 rounded-lg border border-slate-700 pointer-events-none hidden md:block z-10">
        <div className="font-semibold mb-1 text-slate-300">Keyboard Controls</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">W</kbd> Forward</div>
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">S</kbd> Reverse</div>
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">A</kbd> Spin Left</div>
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">D</kbd> Spin Right</div>
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">Q</kbd> Turn Left</div>
          <div><kbd className="bg-slate-700 px-1 rounded text-slate-200">E</kbd> Turn Right</div>
        </div>
      </div>
    </div>
  );
}
