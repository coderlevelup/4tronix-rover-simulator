'use client';

import { useState, useEffect } from 'react';
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
      setShowError(true);
    }
  }, [showValidationError, value]);

  // Sync temp value when value changes
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  // Clear error when user has a valid name
  useEffect(() => {
    if (value.trim().length > 0 && isValidMissionName(value)) {
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
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[11px] font-semibold text-slate-300">
          Mission Name <span className="text-red-500">*</span>
        </label>
        {!isEditing && (
          <button
            onClick={handleGenerateRandom}
            className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition-all duration-200 hover:from-slate-700 hover:to-slate-600 hover:text-white shadow-md hover:shadow-lg"
            title="Generate a random mission name"
          >
            <span className="text-sm">🎲</span>
            <span>Generate</span>
          </button>
        )}
      </div>

      {/* Display Mode */}
      {!isEditing && (
        <div className="space-y-1">
          <div
            className={`flex items-center justify-between rounded-lg border px-2 py-1 ${
              hasError
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-slate-600 bg-slate-950'
            }`}
          >
            <span
              className={`text-xs font-medium truncate ${
                isEmpty
                  ? 'text-slate-400'
                  : 'text-slate-100'
              }`}
            >
              {isEmpty ? (
                <span className="italic text-slate-400">Generate or type...</span>
              ) : (
                value
              )}
            </span>
            <button
              onClick={handleEditStart}
              className="ml-2 flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-blue-400 transition-colors hover:bg-slate-800"
              title="Edit mission name"
            >
              ✏️
            </button>
          </div>

          {/* Status message */}
          <div className="text-xs min-h-[1.25rem]">
            {hasError ? (
              <span className="text-red-400 flex items-center gap-1">
                ⚠️ {error}
              </span>
            ) : !isEmpty ? (
              <span className="text-green-400 flex items-center gap-1">
                ✅ Set ({value.length}/100)
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
            className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{tempValue.length}/100</span>
          </div>

          {/* Edit Action Buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleEditSave}
              disabled={tempValue.trim().length === 0}
              className="flex-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✓ Save
            </button>
            <button
              onClick={handleEditCancel}
              className="flex-1 rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
            >
              ✕
            </button>
            <button
              onClick={handleGenerateRandom}
              className="flex-1 rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              title="Generate a new random name"
            >
              🎲
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
