'use client';

import { ManualControlRealtime } from '@/components/mission/ManualControlRealtime';
import { BlocklyEditor } from '@/components/mission/BlocklyEditor';
import { MonacoCodeEditor } from '@/components/mission/MonacoCodeEditor';
import { MissionNameInput } from '@/components/mission/MissionNameInput';
import type { RoverState } from '@/lib/rover-physics';

export type EditorMode = 'manual' | 'blockly' | 'code';

type SimulationCommand = {
  command: string;
  speed?: number;
  duration?: number;
  degrees?: number;
};

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

  missionName: string;
  onMissionNameChange: (name: string) => void;
  missionNameError: string | null;
  onMissionNameError: (error: string | null) => void;
  showMissionNameValidation: boolean;
  onMissionNameValidationChange: (valid: boolean) => void;

  onSubmit: () => void;
  submitting: boolean;
  submitSuccess: boolean;
  currentCode: string;
  isMissionNameValid: boolean;
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
  missionName,
  onMissionNameChange,
  missionNameError,
  onMissionNameError,
  showMissionNameValidation,
  onMissionNameValidationChange,
  onSubmit,
  submitting,
  submitSuccess,
  currentCode,
  isMissionNameValid,
}: EditorPanelProps) {
  // Shared mission-name + submit controls (used by both Blockly and Code modes)
  const submitBar = (
    <div className="flex-1 flex flex-col gap-2">
      <MissionNameInput
        value={missionName}
        onChange={onMissionNameChange}
        onError={onMissionNameError}
        error={missionNameError}
        showValidationError={showMissionNameValidation}
        onValidationChange={onMissionNameValidationChange}
      />

      <button
        onClick={onSubmit}
        disabled={submitting || !currentCode.trim() || !isMissionNameValid}
        className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition-all duration-300 hover:shadow-xl hover:shadow-orange-900/30 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg active:scale-95"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>🚀</span>
              <span>Send to Rover Queue</span>
            </>
          )}
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Mission Control
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Editor {panelSplit}% / Sim {100 - panelSplit}%</span>
          <input
            type="range"
            min={35}
            max={75}
            step={1}
            value={panelSplit}
            onChange={(event) => onPanelSplitChange(Number(event.target.value))}
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-emerald-500"
            aria-label="Adjust editor and simulator panel size"
          />
        </div>
      </div>

      {/* Editor mode tabs */}
      <div className="flex gap-1 flex-shrink-0">
        {(['manual', 'blockly', 'code'] as EditorMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onEditorModeChange(mode)}
            className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              editorMode === mode
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {mode === 'manual' ? 'Manual' : mode === 'blockly' ? 'Blockly' : 'Code'}
          </button>
        ))}
      </div>

      {error && (
        <div className="animate-in slide-in-from-top-2 fade-in duration-300 rounded-lg border border-red-500/20 bg-red-500/10 backdrop-blur-xl p-1.5 text-xs text-red-400 flex-shrink-0">
          <div className="flex items-start gap-2">
            <span>⚠️</span>
            <p className="text-red-300/90">{error}</p>
          </div>
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
        {editorMode === 'blockly' && <BlocklyEditor onGenerateCommands={onGenerateCommands} onCodeChange={onCodeChange} />}
        {editorMode === 'code' && <MonacoCodeEditor onGenerateCommands={onGenerateCommands} onCodeChange={onCodeChange} />}
      </div>

      {/* Mission name + submit - Blockly mode */}
      {editorMode === 'blockly' && <div className="flex gap-2 flex-shrink-0">{submitBar}</div>}

      {/* Available commands + submit - Code mode */}
      {editorMode === 'code' && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start flex-shrink-0">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400 lg:w-[42%]">
            <p className="mb-2 font-semibold text-slate-300">Available Commands:</p>
            <ul className="space-y-1 font-mono">
              <li>rover.forward(speed, duration)</li>
              <li>rover.reverse(speed, duration)</li>
              <li>rover.spinLeft(speed, duration)</li>
              <li>rover.spinRight(speed, duration)</li>
              <li>rover.steerLeft(degrees, speed, duration)</li>
              <li>rover.steerRight(degrees, speed, duration)</li>
              <li>rover.stop()</li>
            </ul>
          </div>

          {submitBar}
        </div>
      )}

      {submitSuccess && (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-500 rounded-lg border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-xl p-1.5 shadow-lg shadow-green-900/10 flex-shrink-0">
          <div className="flex items-start gap-2">
            <span className="text-sm">✅</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-green-400">Mission Submitted</p>
              <p className="text-xs text-green-300/80">In queue for rover execution.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
