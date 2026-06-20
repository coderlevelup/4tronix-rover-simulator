/**
 * Challenge Dashboard Component
 *
 * Main interface for the gamified challenge system
 * Tabs for:
 * - Challenges
 * - Progress
 * - Leaderboard
 * - Badges
 */

'use client';

import { useState, useEffect } from 'react';
import { useLearner } from '@/contexts/LearnerContext';
import { Challenge } from '@/core/domain/entities/Challenge';
import { LevelDisplay, LevelBadge } from '@/components/challenge/LevelDisplay';
import { ChallengeList } from '@/components/challenge/ChallengeCard';
import { BadgeDisplay } from '@/components/challenge/BadgeDisplay';
import { LeaderboardView } from '@/components/challenge/LeaderboardView';

type Tab = 'challenges' | 'progress' | 'leaderboard' | 'badges';

export function ChallengeDashboard() {
  const { learner, sessionId, loading } = useLearner();
  const [activeTab, setActiveTab] = useState<Tab>('challenges');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengesLoading, setCharengesLoading] = useState(true);

  // Load challenges on mount
  useEffect(() => {
    void (async () => {
      try {
        // Load from API or data file
        const response = await fetch('/api/challenges');
        if (response.ok) {
          const data = await response.json();
          setChallenges(data.challenges || []);
        }
      } catch (error) {
        console.error('Failed to load challenges:', error);
      } finally {
        setCharengesLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!learner || !sessionId) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/20 p-6">
        <h3 className="text-lg font-semibold text-red-400">Session Error</h3>
        <p className="mt-2 text-sm text-red-300">
          Failed to initialize learner session. Please refresh the page.
        </p>
      </div>
    );
  }

  // Filter challenges by status
  const challengesWithStatus = challenges.map((challenge) => ({
    ...challenge,
    status:
      learner.challenges_completed.includes(challenge.id)
        ? ('completed' as const)
        : learner.challenges_unlocked.includes(challenge.id)
        ? ('unlocked' as const)
        : ('locked' as const),
  }));

  const unlockedChallenges = challengesWithStatus.filter(
    (c) => c.status !== 'locked'
  );
  const completedChallenges = challengesWithStatus.filter(
    (c) => c.status === 'completed'
  );

  return (
    <div className="space-y-6">
      {/* Header with level and stats */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">
              🎮 Challenge System
            </h1>
            <p className="mt-1 text-slate-400">
              Master coding through gamified challenges
            </p>
          </div>
          <LevelBadge learner={learner} />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Challenges Completed"
            value={completedChallenges.length}
            icon="🎯"
          />
          <StatCard
            label="Total XP"
            value={learner.xp}
            icon="⭐"
          />
          <StatCard
            label="Badges Earned"
            value={learner.badges.length}
            icon="🏆"
          />
          <StatCard
            label="Current Streak"
            value={Math.min(completedChallenges.length, 10)}
            icon="🔥"
          />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-slate-700">
        <TabButton
          active={activeTab === 'challenges'}
          onClick={() => setActiveTab('challenges')}
          label="🎯 Challenges"
        />
        <TabButton
          active={activeTab === 'progress'}
          onClick={() => setActiveTab('progress')}
          label="📊 Progress"
        />
        <TabButton
          active={activeTab === 'leaderboard'}
          onClick={() => setActiveTab('leaderboard')}
          label="🏅 Leaderboard"
        />
        <TabButton
          active={activeTab === 'badges'}
          onClick={() => setActiveTab('badges')}
          label="🏆 Badges"
        />
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'challenges' && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-4 text-xl font-semibold text-slate-100">
                Available Challenges
              </h2>
              {challengesLoading ? (
                <div className="text-center text-slate-400">
                  Loading challenges...
                </div>
              ) : (
                <ChallengeList
                  challenges={unlockedChallenges}
                  emptyMessage="No unlocked challenges yet. Level up to unlock more!"
                />
              )}
            </div>

            {completedChallenges.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-semibold text-slate-100">
                  ✅ Completed Challenges
                </h2>
                <ChallengeList
                  challenges={completedChallenges}
                  emptyMessage="No completed challenges yet"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="space-y-6">
            <LevelDisplay learner={learner} />

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-100">
                Progress Summary
              </h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <ProgressCard
                  label="Completion Rate"
                  value={
                    challenges.length > 0
                      ? `${Math.round(
                          (completedChallenges.length / challenges.length) *
                            100
                        )}%`
                      : '0%'
                  }
                  subtext={`${completedChallenges.length}/${challenges.length}`}
                />
                <ProgressCard
                  label="Total Attempts"
                  value={learner.missionCount + completedChallenges.length}
                  subtext="missions + challenges"
                />
                <ProgressCard
                  label="Success Rate"
                  value={
                    learner.missionCount > 0
                      ? `${Math.round(
                          (learner.completedMissions / learner.missionCount) *
                            100
                        )}%`
                      : '0%'
                  }
                  subtext="missions completed"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView currentLearnerId={sessionId} limit={50} />
        )}

        {activeTab === 'badges' && (
          <BadgeDisplay
            learner={learner}
            earnedBadgeIds={learner.badges}
            showProgress={true}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Stat card component
 */
function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-700/30 p-4 text-center">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

/**
 * Tab button component
 */
function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 font-semibold transition-colors ${
        active
          ? 'border-b-2 border-blue-500 text-blue-400'
          : 'text-slate-400 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Progress card component
 */
function ProgressCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded border border-slate-700 bg-slate-700/30 p-4 text-center">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
      {subtext && <div className="mt-1 text-xs text-slate-500">{subtext}</div>}
    </div>
  );
}