/**
 * Challenge Card Component
 * Displays a challenge with its difficulty, XP reward, and status
 * Clickable to open the challenge
 */

'use client';

import { Challenge } from '@/core/domain/entities/Challenge';
import Link from 'next/link';

interface ChallengeCardProps {
  challenge: Challenge;
  status?: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  onSelect?: (challenge: Challenge) => void;
}

const difficultyColors = {
  beginner: {
    bg: 'bg-green-900/20',
    border: 'border-green-700',
    badge: 'bg-green-900 text-green-100',
    text: 'text-green-400',
  },
  intermediate: {
    bg: 'bg-yellow-900/20',
    border: 'border-yellow-700',
    badge: 'bg-yellow-900 text-yellow-100',
    text: 'text-yellow-400',
  },
  advanced: {
    bg: 'bg-red-900/20',
    border: 'border-red-700',
    badge: 'bg-red-900 text-red-100',
    text: 'text-red-400',
  },
};

const statusIcons = {
  locked: '🔒',
  unlocked: '🔓',
  in_progress: '⏳',
  completed: '✅',
};

export function ChallengeCard({
  challenge,
  status = 'unlocked',
  onSelect,
}: ChallengeCardProps) {
  const colors = difficultyColors[challenge.difficulty];
  const icon = statusIcons[status];

  const handleClick = () => {
    if (onSelect) {
      onSelect(challenge);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        rounded-lg border p-4 cursor-pointer transition-all
        ${colors.bg} ${colors.border}
        hover:shadow-lg hover:shadow-slate-700/30
        ${status === 'locked' ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-1'}
      `}
    >
      {/* Header with status and difficulty */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className={`px-2 py-1 rounded text-xs font-semibold ${colors.badge}`}>
            {challenge.difficulty}
          </span>
        </div>
        <span className="text-2xl">✨</span>
      </div>

      {/* Title and description */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-100">{challenge.title}</h3>
        <p className="mt-1 text-xs text-slate-400 line-clamp-2">
          {challenge.description}
        </p>
      </div>

      {/* XP and category */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-slate-400">📂 {challenge.category}</span>
        <span className={`text-sm font-bold ${colors.text}`}>
          +{challenge.xpReward} XP
        </span>
      </div>

      {/* Hints indicator */}
      <div className="flex gap-1">
        {challenge.hints.map((_, i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-slate-600/50"
          />
        ))}
      </div>

      {/* Status message */}
      {status === 'locked' && (
        <div className="mt-3 text-xs text-slate-400">
          🔒 Unlock by reaching higher level
        </div>
      )}
      {status === 'completed' && (
        <div className="mt-3 text-xs text-green-400">
          ✅ Completed
        </div>
      )}
    </div>
  );
}

/**
 * Challenge List Component
 * Displays multiple challenges in a grid
 */
interface ChallengeListProps {
  challenges: (Challenge & { status?: 'locked' | 'unlocked' | 'in_progress' | 'completed' })[];
  onSelectChallenge?: (challenge: Challenge) => void;
  emptyMessage?: string;
}

export function ChallengeList({
  challenges,
  onSelectChallenge,
  emptyMessage = 'No challenges available',
}: ChallengeListProps) {
  if (challenges.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
        <p className="text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {challenges.map((challenge) => (
        <ChallengeCard
          key={challenge.id}
          challenge={challenge}
          status={challenge.status}
          onSelect={onSelectChallenge}
        />
      ))}
    </div>
  );
}