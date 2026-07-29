'use client';

import { useState, useEffect } from 'react';
import { Dices, AlertTriangle } from 'lucide-react';
import { generateRandomMissionName, isValidMissionName } from '@/lib/missionNameGenerator';

interface MissionNameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  onError?: (error: string | null) => void;
  showValidationError?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

export function MissionNameInput({
  value,
  onChange,
  error,
  onError,
  showValidationError = false,
  onValidationChange,
}: MissionNameInputProps) {
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (showValidationError && value.trim().length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surface the error when the parent signals a failed submit attempt
      setShowError(true);
    }
  }, [showValidationError, value]);

  useEffect(() => {
    if (value.trim().length > 0 && isValidMissionName(value)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the error as soon as the name becomes valid
      setShowError(false);
      onError?.(null);
    }
  }, [value, onError]);

  useEffect(() => {
    const isValid = value.trim().length > 0 && isValidMissionName(value);
    onValidationChange?.(isValid);
  }, [value, onValidationChange]);

  const handleGenerateRandom = () => {
    const newName = generateRandomMissionName();
    onChange(newName);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= 100) {
      onChange(newValue);
      if (showError) {
        setShowError(false);
        onError?.(null);
      }
    }
  };

  const hasError = showError && error;

  // A single row so the name and the submit button can sit side by side. The
  // card chrome, the standalone label and the always-present status line cost
  // 99px of height between them, in a workspace locked to the viewport where
  // the block canvas only had 311px to work with.
  //
  // The label is kept for screen readers rather than deleted: the placeholder
  // alone is not an accessible name, and it disappears as soon as you type.
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor="mission-name" className="sr-only">
          Mission name (required)
        </label>
        <input
          id="mission-name"
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder="Name your mission..."
          maxLength={100}
          required
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? 'mission-name-error' : undefined}
          className={`h-9 w-full min-w-0 rounded-lg border bg-background/70 px-2.5 text-xs text-foreground placeholder-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 ${
            hasError ? 'border-destructive/60' : 'border-border'
          }`}
        />
        {/* Icon only. The accessible name and tooltip carry the meaning the
            visible label used to, so the button is still announced and still
            explains itself on hover. */}
        <button
          onClick={handleGenerateRandom}
          className="clay-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-foreground"
          title="Generate a random mission name"
          aria-label="Generate a random mission name"
        >
          <Dices className="h-4 w-4 text-primary" />
        </button>
      </div>

      {/* Rendered only when it fires, so a valid name costs no height. The
          old "Set (12/100)" confirmation is gone: a filled field already
          says that, and it reserved 20px permanently to do it. */}
      {hasError && (
        <p
          id="mission-name-error"
          className="mt-1 flex items-center gap-1 text-[11px] text-destructive"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
