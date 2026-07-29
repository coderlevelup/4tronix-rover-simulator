'use client';

import { Rocket, CheckCircle2 } from 'lucide-react';
import { MissionNameInput } from '@/components/mission/MissionNameInput';

/**
 * Name-and-launch controls, rendered as the footer of the simulator column.
 *
 * These used to be stacked under the block canvas, where they cost 147px of a
 * workspace locked to the viewport - against 311px for the canvas itself. The
 * simulator's arena is drawn letterboxed with vertical slack to spare, so the
 * space is cheaper on that side.
 *
 * Only mounted in Blocks and Python modes. Drive mode has no code to send, so
 * it would otherwise show a permanently disabled button.
 *
 * Sizing responds to the CONTAINER, not the viewport: the split slider can
 * squeeze this column to 320px while the window stays wide, so viewport
 * breakpoints would not see it coming. Below 24rem the button takes its own
 * line rather than crushing the name field to a few characters.
 */
interface MissionSubmitBarProps {
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

export function MissionSubmitBar({
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
}: MissionSubmitBarProps) {
  return (
    <div className="@container shrink-0 border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-start gap-2">
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
          className="clay clay-press flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-gradient-mars px-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 @min-[24rem]:w-auto"
        >
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              <span>Send to Mission Control</span>
            </>
          )}
        </button>
      </div>

      {/* Confirmation belongs next to the button that earned it, not back in
          the editor column the controls just left. */}
      {submitSuccess && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-buzz/40 bg-buzz/10 p-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-buzz" />
          <div className="flex-1">
            <p className="text-xs font-bold text-buzz">Mission sent!</p>
            <p className="text-xs text-buzz/80">It is in the queue for the rover to run.</p>
          </div>
        </div>
      )}
    </div>
  );
}
