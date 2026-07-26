'use client';

import { useState, useEffect } from 'react';
import { Dices, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  const isEmpty = value.trim().length === 0;

  return (
    <div className="rounded-xl border border-border/70 bg-secondary/30 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[11px] font-bold text-foreground">
          Mission name <span className="text-destructive">*</span>
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={value}
            onChange={handleInputChange}
            placeholder="Enter mission name..."
            maxLength={100}
            className={`w-full rounded-lg border bg-background/70 px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 ${
              hasError
                ? 'border-destructive/50'
                : 'border-border'
            }`}
          />
          <button
            onClick={handleGenerateRandom}
            className="clay-press flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs font-bold text-foreground"
            title="Generate a random mission name"
          >
            <Dices className="h-3.5 w-3.5 text-primary" />
            <span>Generate</span>
          </button>
        </div>

        {/* Status message */}
        <div className="min-h-[1.25rem] text-xs">
          {hasError ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </span>
          ) : !isEmpty ? (
            <span className="flex items-center gap-1 text-buzz">
              <CheckCircle2 className="h-3.5 w-3.5" /> Set ({value.length}/100)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
