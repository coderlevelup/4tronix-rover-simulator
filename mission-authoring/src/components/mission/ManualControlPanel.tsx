"use client";

import styles from './ManualControlPanel.module.css';

interface ManualControlPanelProps {
  onCommand: (command: string, speed?: number) => void;
  disabled?: boolean;
}

export function ManualControlPanel({ onCommand, disabled }: ManualControlPanelProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-4 h-full w-full">
      <h3 className="text-xl font-semibold text-slate-200">Manual Controls</h3>

      {/* Direction Controls Grid */}
      <div className={`grid w-full grid-cols-3 gap-3 flex-1 ${styles.autoRowsFr}`}>
        {/* Row 1 */}
        <button
          onClick={() => onCommand('steerLeft', 60)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-blue-600 px-3 text-lg font-semibold text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↰ Steer Left
        </button>
        <button
          onClick={() => onCommand('forward', 80)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-emerald-600 px-3 text-lg font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↑ Forward
        </button>
        <button
          onClick={() => onCommand('steerRight', 60)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-blue-600 px-3 text-lg font-semibold text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↱ Steer Right
        </button>

        {/* Row 2 */}
        <button
          onClick={() => onCommand('spinLeft', 60)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-purple-600 px-3 text-lg font-semibold text-white hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↺ Spin Left
        </button>
        <button
          onClick={() => onCommand('stop', 0)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-red-600 px-3 text-lg font-semibold text-white hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ■ Stop
        </button>
        <button
          onClick={() => onCommand('spinRight', 60)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-purple-600 px-3 text-lg font-semibold text-white hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↻ Spin Right
        </button>

        {/* Row 3 */}
        <div></div>
        <button
          onClick={() => onCommand('reverse', 80)}
          disabled={disabled}
          className="w-full h-full rounded-xl bg-orange-600 px-3 text-lg font-semibold text-white hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          ↓ Reverse
        </button>
        <div></div>
      </div>

      <p className="text-center text-sm text-slate-400">
        Use arrow buttons to control the rover manually. Click Stop to halt movement.
      </p>
    </div>
  );
}
