/**
 * Badge Display Component
 * Shows earned badges and progress towards unearned badges
 */

'use client';

import { useState, useEffect } from 'react';
import { BADGE_DEFINITIONS, BadgeDefinition } from '@/core/domain/entities/Badge';
import { Learner, getLevelName } from '@/core/domain/entities/Learner';
import { BadgeService } from '@/core/application/services/BadgeService';

interface BadgeDisplayProps {
  learner: Learner;
  earnedBadgeIds: string[];
  showProgress?: boolean;
}

export function BadgeDisplay({
  learner,
  earnedBadgeIds,
  showProgress = true,
}: BadgeDisplayProps) {
  const earnedBadges = BADGE_DEFINITIONS.filter((b) =>
    earnedBadgeIds.includes(b.id)
  );

  const unearnedBadges = BADGE_DEFINITIONS.filter(
    (b) => !earnedBadgeIds.includes(b.id)
  );

  return (
    <div className="space-y-6">
      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-slate-100">
            🏆 Badges Earned ({earnedBadges.length})
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {earnedBadges.map((badge) => (
              <EarnedBadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </div>
      )}

      {/* Unearned Badges */}
      {showProgress && unearnedBadges.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-slate-100">
            🎯 Badges to Unlock ({unearnedBadges.length})
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {unearnedBadges.map((badge) => (
              <UnlockedBadgeCard
                key={badge.id}
                badge={badge}
                learner={learner}
              />
            ))}
          </div>
        </div>
      )}

      {earnedBadges.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
          <p className="text-slate-400">
            Complete challenges to earn badges!
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Earned Badge Card - shows completed badge
 */
function EarnedBadgeCard({ badge }: { badge: BadgeDefinition }) {
  return (
    <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-4 text-center">
      <div className="mb-2 text-4xl">{badge.icon}</div>
      <h4 className="text-sm font-semibold text-slate-100">{badge.name}</h4>
      <p className="mt-1 text-xs text-slate-400">{badge.description}</p>
      <div className="mt-2">
        <span className="inline-block rounded bg-yellow-900/50 px-2 py-1 text-xs font-bold text-yellow-300">
          ✓ Earned
        </span>
      </div>
    </div>
  );
}

/**
 * Unearned Badge Card - shows progress towards badge
 */
function UnlockedBadgeCard({
  badge,
  learner,
}: {
  badge: BadgeDefinition;
  learner: Learner;
}) {
  const [progress, setProgress] = useState<{ progress: number; description: string } | null>(null);

  useEffect(() => {
    // For now, we'll compute progress client-side
    // In production, you might fetch this from the server
    const progressData = getProgressTowardsBadge(learner, badge.id);
    setProgress(progressData);
  }, [learner, badge.id]);

  if (!progress) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
      <div className="mb-2 text-4xl opacity-50">{badge.icon}</div>
      <h4 className="text-sm font-semibold text-slate-100">{badge.name}</h4>
      <p className="mt-1 text-xs text-slate-400">{badge.description}</p>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
          <div
            className={`h-full transition-all duration-500 ${
              progress.progress >= 100
                ? 'bg-yellow-500'
                : progress.progress >= 50
                ? 'bg-blue-500'
                : 'bg-slate-600'
            }`}
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">{progress.description}</p>
      </div>
    </div>
  );
}

/**
 * Calculate progress towards a badge
 * (Simplified version - for full version use BadgeService)
 */
function getProgressTowardsBadge(learner: Learner, badgeId: string): {
  progress: number;
  description: string;
} {
  const completedChallenges = learner.challenges_completed || [];

  switch (badgeId) {
    case 'first-steps':
      return {
        progress: Math.min(completedChallenges.length, 1) * 100,
        description: `Complete 1 challenge (${completedChallenges.length}/1)`,
      };

    case 'shape-starter': {
      const beginnerIds = [
        'draw-line',
        'draw-square',
        'draw-rectangle',
        'draw-triangle',
      ];
      const count = beginnerIds.filter((id) =>
        completedChallenges.includes(id)
      ).length;
      return {
        progress: (count / 4) * 100,
        description: `Complete all beginner shapes (${count}/4)`,
      };
    }

    case 'house-builder':
      return {
        progress: completedChallenges.includes('draw-house') ? 100 : 0,
        description: 'Complete "Draw a House" challenge',
      };

    case 'centurion':
      return {
        progress: Math.min(learner.xp, 100),
        description: `Earn 100 XP (${learner.xp}/100)`,
      };

    case 'level-3':
      return {
        progress: (learner.level / 3) * 100,
        description: `Reach Level 3 (${learner.level}/3)`,
      };

    case 'hintless':
      return {
        progress: 0,
        description: 'Complete a challenge without using hints',
      };

    case 'speed-runner':
      return {
        progress: 0,
        description: 'Complete 3 challenges in a row without failing',
      };

    case 'perfectionist':
      return {
        progress: 0,
        description: '100% success rate over first 5 submissions',
      };

    case 'all-shapes': {
      const shapeIds = [
        'draw-line',
        'draw-square',
        'draw-rectangle',
        'draw-triangle',
        'draw-circle',
        'draw-house',
      ];
      const count = shapeIds.filter((id) =>
        completedChallenges.includes(id)
      ).length;
      return {
        progress: (count / 6) * 100,
        description: `Complete all shape challenges (${count}/6)`,
      };
    }

    default:
      return {
        progress: 0,
        description: 'Unlock this badge',
      };
  }
}