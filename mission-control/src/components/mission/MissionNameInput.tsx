'use client';

import { useState, useEffect } from 'react';
import { Dices, Pencil, Check, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { generateRandomMissionName, isValidMissionName } from '@/lib/missionNameGenerator';

interface MissionNameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  onError?: (error: string | null) => void;
  showValidationError?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

/**
 * Mission Name Input Component
 *
 * Features:
 * - Random name generation (Part1 + Part2 + Number)
 * - Compulsory field (user must enter a name)
 * - Edit capability
 * - Character counter (max 100)
 * - Visual feedback for validation
 *
 * User Story Requirements:
 * ✅ User can name their mission (compulsory, not optional)
 * ✅ User can randomly generate the name
 * ✅ User can edit the generated name
 */
export function MissionNameInput({
  value,
  onChange,
  error,
  onError,
  showValidationError = false,
  onValidationChange,
}: MissionNameInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [showError, setShowError] = useState(false);

  // Show error when parent component triggers validation (on submit attempt)
  useEffect(() => {
    if (showValidationError && value.trim().length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surface the error when the parent signals a failed submit attempt
      setShowError(true);
    }
  }, [showValidationError, value]);

  // Sync temp value when value changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the edit draft in step with the saved name (e.g. random generation)
    setTempValue(value);
  }, [value]);

  // Clear error when user has a valid name
  useEffect(() => {
    if (value.trim().length > 0 && isValidMissionName(value)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the error as soon as the name becomes valid
      setShowError(false);
      onError?.(null);
    }
  }, [value, onError]);

  // Notify parent about validation state (considering both saved and editing values)
  useEffect(() => {
    const currentValue = isEditing ? tempValue : value;
    const isValid = currentValue.trim().length > 0 && isValidMissionName(currentValue);
    onValidationChange?.(isValid);
  }, [value, tempValue, isEditing, onValidationChange]);

  const handleGenerateRandom = () => {
    const newName = generateRandomMissionName();
    onChange(newName);
    setTempValue(newName);
    setIsEditing(false);
  };

  const handleEditStart = () => {
    setIsEditing(true);
    // Clear error when user starts editing
    setShowError(false);
    onError?.(null);
  };

  const handleEditSave = () => {
    if (tempValue.trim().length === 0) {
      return;
    }
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= 100) {
      setTempValue(newValue);
      // Clear error when user starts typing
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
        {!isEditing && (
          <button
            onClick={handleGenerateRandom}
            className="clay-press flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1 text-xs font-bold text-foreground"
            title="Generate a random mission name"
          >
            <Dices className="h-3.5 w-3.5 text-primary" />
            <span>Generate</span>
          </button>
        )}
      </div>

      {/* Display Mode */}
      {!isEditing && (
        <div className="space-y-1">
          <div
            className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${
              hasError
                ? 'border-destructive/50 bg-destructive/10'
                : 'border-border bg-background/70'
            }`}
          >
            <span
              className={`truncate text-xs font-medium ${isEmpty ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {isEmpty ? (
                <span className="italic text-muted-foreground">Generate or type a name...</span>
              ) : (
                value
              )}
            </span>
            <button
              onClick={handleEditStart}
              className="ml-2 flex shrink-0 items-center rounded p-1 text-primary transition-colors hover:bg-card"
              aria-label="Edit mission name"
              title="Edit mission name"
            >
              <Pencil className="h-3.5 w-3.5" />
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
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={tempValue}
            onChange={handleInputChange}
            placeholder="Enter mission name..."
            maxLength={100}
            autoFocus
            className="w-full rounded-lg border border-primary/60 bg-background/70 px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground tabular-nums">{tempValue.length}/100</span>
          </div>

          {/* Edit Action Buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleEditSave}
              disabled={tempValue.trim().length === 0}
              className="clay-press flex flex-1 items-center justify-center gap-1 rounded-lg bg-buzz px-2 py-1.5 text-xs font-bold text-background transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Save
            </button>
            <button
              onClick={handleEditCancel}
              className="clay-press flex flex-1 items-center justify-center rounded-lg border border-border/60 bg-card px-2 py-1.5 text-xs font-bold text-foreground"
              aria-label="Cancel editing"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleGenerateRandom}
              className="clay-press flex flex-1 items-center justify-center rounded-lg border border-border/60 bg-card px-2 py-1.5 text-xs font-bold text-foreground"
              aria-label="Generate a new random name"
              title="Generate a new random name"
            >
              <Dices className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
