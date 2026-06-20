/**
 * Hint Panel Component
 * Displays hints progressively (1, 2, 3)
 * Tracks hint usage and penalties
 */

'use client';

import { useState } from 'react';
import { Challenge } from '@/core/domain/entities/Challenge';
import { useGetChallengeHint } from '@/hooks/useChallengeSubmit';

interface HintPanelProps {
  challenge: Challenge;
  learnerId: string;
  onHintRevealed?: (hintLevel: number, hint: string) => void;
  maxHints?: number;
}

export function HintPanel({
  challenge,
  learnerId,
  onHintRevealed,
  maxHints = 3,
}: HintPanelProps) {
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [loadingHint, setLoadingHint] = useState<number | null>(null);
  const { getHint } = useGetChallengeHint();

  const handleRevealHint = async (hintLevel: number) => {
    if (revealedHints.includes(hintLevel)) {
      return;
    }

    setLoadingHint(hintLevel);

    const hint = await getHint(learnerId, challenge.id, hintLevel);

    setLoadingHint(null);

    if (hint) {
      setRevealedHints([...revealedHints, hintLevel]);
      if (onHintRevealed) {
        onHintRevealed(hintLevel, hint);
      }
    }
  };

  const totalHintsUsed = revealedHints.length;
  const xpPenalty = totalHintsUsed * 10; // 10% per hint

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">
          💡 Hints Available
        </h3>
        <span className="text-xs text-slate-400">
          {maxHints - totalHintsUsed} remaining
        </span>
      </div>

      {/* Hints list */}
      <div className="space-y-2">
        {challenge.hints.map((hint, i) => {
          const hintLevel = i + 1;
          const isRevealed = revealedHints.includes(hintLevel);
          const isLoading = loadingHint === hintLevel;

          return (
            <div
              key={hintLevel}
              className={`rounded border p-3 transition-all ${
                isRevealed
                  ? 'border-yellow-700 bg-yellow-900/20'
                  : 'border-slate-700 bg-slate-700/30'
              }`}
            >
              <button
                onClick={() => handleRevealHint(hintLevel)}
                disabled={isRevealed || totalHintsUsed >= maxHints || isLoading}
                className={`w-full text-left ${
                  isRevealed || isLoading
                    ? 'cursor-default'
                    : 'hover:text-yellow-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">
                    {isLoading ? (
                      <>⏳ Loading hint {hintLevel}...</>
                    ) : isRevealed ? (
                      <>✓ Hint {hintLevel}</>
                    ) : (
                      <>? Hint {hintLevel}</>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">
                    {isRevealed ? '✓ Used' : 'Locked'}
                  </span>
                </div>

                {/* Hint content */}
                {isRevealed && (
                  <p className="mt-2 text-xs text-slate-300">{hint.text}</p>
                )}

                {!isRevealed && !isLoading && (
                  <p className="mt-1 text-xs text-slate-400">
                    Click to reveal (⚠️ -10% XP)
                  </p>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* XP penalty warning */}
      {totalHintsUsed > 0 && (
        <div className="mt-4 rounded bg-orange-900/20 border border-orange-700 p-3">
          <p className="text-xs text-orange-400">
            ⚠️ Using {totalHintsUsed} hint{totalHintsUsed === 1 ? '' : 's'}{' '}
            reduces XP reward by {xpPenalty}%
          </p>
        </div>
      )}

      {/* All hints used */}
      {totalHintsUsed >= maxHints && (
        <div className="mt-4 rounded bg-slate-700/30 border border-slate-600 p-3">
          <p className="text-xs text-slate-400">
            All hints used. Give it your best shot! 💪
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsed hint counter - for space-constrained layouts
 */
interface HintCounterProps {
  totalHints: number;
  usedHints: number;
  onClick?: () => void;
}

export function HintCounter({ totalHints, usedHints, onClick }: HintCounterProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded bg-slate-700/50 px-3 py-2 text-sm hover:bg-slate-600"
    >
      <span>💡</span>
      <span className="font-semibold text-slate-100">
        {totalHints - usedHints}/{totalHints}
      </span>
    </button>
  );
}