/**
 * Level Display Component
 * Shows learner's current level, XP, and progress to next level
 */

'use client';

import { Learner, getLevelName, getXPProgressToNextLevel, LEVEL_THRESHOLDS } from '@/core/domain/entities/Learner';

interface LevelDisplayProps {
  learner: Learner;
  compact?: boolean;
}

const levelEmojis = {
  1: '🥚',  // Rookie
  2: '🌱',  // Explorer
  3: '🏗️',  // Builder
  4: '⚙️',  // Engineer
  5: '👑',  // Master
};

const levelColors = {
  1: 'text-gray-400',
  2: 'text-green-400',
  3: 'text-blue-400',
  4: 'text-purple-400',
  5: 'text-yellow-400',
};

export function LevelDisplay({ learner, compact = false }: LevelDisplayProps) {
  const progress = getXPProgressToNextLevel(learner.xp);
  const progressPercent = (progress.current / progress.required) * 100;
  const levelName = getLevelName(learner.level);
  const emoji = levelEmojis[learner.level as keyof typeof levelEmojis];
  const colorClass = levelColors[learner.level as keyof typeof levelColors];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        <div>
          <div className={`text-sm font-bold ${colorClass}`}>Level {learner.level}</div>
          <div className="text-xs text-slate-400">{learner.xp} XP</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      {/* Level header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{emoji}</span>
          <div>
            <div className={`text-lg font-bold ${colorClass}`}>
              {levelName}
            </div>
            <div className="text-sm text-slate-400">
              Level {learner.level}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-100">{learner.xp}</div>
          <div className="text-xs text-slate-400">Total XP</div>
        </div>
      </div>

      {/* Progress bar to next level */}
      {learner.level < 5 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">Progress to Level {learner.level + 1}</span>
            <span className="text-slate-300">
              {progress.current} / {progress.required}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full transition-all duration-500 ${
                learner.level === 1
                  ? 'bg-green-500'
                  : learner.level === 2
                  ? 'bg-blue-500'
                  : learner.level === 3
                  ? 'bg-purple-500'
                  : 'bg-yellow-500'
              }`}
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {learner.level === 5 && (
        <div className="rounded bg-yellow-900/20 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-yellow-400">
            🏆 Master Level Achieved!
          </p>
        </div>
      )}

      {/* Level thresholds info */}
      <div className="mt-4 grid grid-cols-5 gap-1">
        {Object.entries(LEVEL_THRESHOLDS).map(([level, xp]) => (
          <div
            key={level}
            className={`rounded px-2 py-1 text-center text-xs font-semibold ${
              parseInt(level) === learner.level
                ? 'bg-slate-600 text-slate-100'
                : parseInt(level) < learner.level
                ? 'bg-green-900/30 text-green-400'
                : 'bg-slate-700/50 text-slate-400'
            }`}
          >
            <div>{level}</div>
            <div className="text-[10px]">{xp}XP</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact level badge - for use in headers, cards, etc
 */
export function LevelBadge({ learner }: { learner: Learner }) {
  const emoji = levelEmojis[learner.level as keyof typeof levelEmojis];
  const colorClass = levelColors[learner.level as keyof typeof levelColors];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${colorClass} border-current/30 bg-slate-800`}>
      <span>{emoji}</span>
      <span className="font-semibold">Level {learner.level}</span>
    </div>
  );
}

/**
 * XP Bar - shows progress in a linear format
 */
export function XPBar({ learner }: { learner: Learner }) {
  const progress = getXPProgressToNextLevel(learner.xp);
  const progressPercent = (progress.current / progress.required) * 100;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-400">{progress.current}</span>
        <span className="text-slate-400">{progress.required}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}