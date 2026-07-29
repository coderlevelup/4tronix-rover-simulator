'use client';

import { Gamepad2, Blocks, Code2, AlertTriangle } from 'lucide-react';
import { ManualControlRealtime } from '@/components/mission/ManualControlRealtime';
import { BlocklyEditor } from '@/components/mission/BlocklyEditor';
import { MonacoCodeEditor } from '@/components/mission/MonacoCodeEditor';
import type { RoverState } from '@/lib/rover-physics';

export type EditorMode = 'manual' | 'blockly' | 'code';

type SimulationCommand = {
  command: string;
  speed?: number;
  duration?: number;
  degrees?: number;
};

// Blocks-first ordering: tap-to-drive on-ramp, then the block editor (the hero),
// then Python for those ready for it.
const MODES: { mode: EditorMode; label: string; Icon: typeof Gamepad2 }[] = [
  { mode: 'manual', label: 'Drive', Icon: Gamepad2 },
  { mode: 'blockly', label: 'Blocks', Icon: Blocks },
  { mode: 'code', label: 'Python', Icon: Code2 },
];

interface EditorPanelProps {
  panelSplit: number;
  onPanelSplitChange: (value: number) => void;

  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  error: string | null;

  onManualTrajectory: (trajectory: RoverState[]) => void;
  onResetSimulation: () => void;
  manualResetVersion: number;
  onGenerateCommands: (commands: SimulationCommand[]) => void;
  onCodeChange: (code: string) => void;
  onBlocklyStateChange?: (state: string) => void;
}

export function EditorPanel({
  panelSplit,
  onPanelSplitChange,
  editorMode,
  onEditorModeChange,
  error,
  onManualTrajectory,
  onResetSimulation,
  manualResetVersion,
  onGenerateCommands,
  onCodeChange,
  onBlocklyStateChange,
}: EditorPanelProps) {
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-2.5 clay">
      {/* Panel split control */}
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className="tabular-nums">Build {panelSplit}% · Sim {100 - panelSplit}%</span>
          <input
            type="range"
            min={35}
            max={75}
            step={1}
            value={panelSplit}
            onChange={(event) => onPanelSplitChange(Number(event.target.value))}
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            aria-label="Adjust build and simulator panel size"
          />
        </label>
      </div>

      {/* Editor mode tabs */}
      <div className="flex flex-shrink-0 gap-1.5">
        {MODES.map(({ mode, label, Icon }) => {
          const active = editorMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onEditorModeChange(mode)}
              aria-pressed={active}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-bold transition-colors ${
                active
                  ? 'bg-gradient-mars text-primary-foreground clay'
                  : 'border border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex flex-shrink-0 items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {editorMode === 'manual' && (
          <ManualControlRealtime
            onTrajectoryUpdate={onManualTrajectory}
            onReset={onResetSimulation}
            resetVersion={manualResetVersion}
          />
        )}
        {editorMode === 'blockly' && <BlocklyEditor onGenerateCommands={onGenerateCommands} onCodeChange={onCodeChange} onBlocklyStateChange={onBlocklyStateChange} />}
        {editorMode === 'code' && <MonacoCodeEditor onGenerateCommands={onGenerateCommands} onCodeChange={onCodeChange} />}
      </div>

    </div>
  );
}
