/**
 * Challenges Page
 *
 * Main challenge interface where learners:
 * - Browse available challenges
 * - Select and attempt challenges
 * - View their progress
 * - Access leaderboard
 * - View earned badges
 *
 * Route: /challenges
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLearner } from '@/contexts/LearnerContext';
import { Challenge } from '@/core/domain/entities/Challenge';
import { LevelDisplay, LevelBadge } from '@/components/challenge/LevelDisplay';
import { ChallengeCard, ChallengeList } from '@/components/challenge/ChallengeCard';

type TabType = 'available' | 'progress' | 'leaderboard' | 'badges';

export function ChallengesPage() {
  const router = useRouter();
  const { learner, sessionId, loading: learnerLoading } = useLearner();
  const [activeTab, setActiveTab] = useState<TabType>('available');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);

  // Load challenges on mount
  useEffect(() => {
    const loadChallenges = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call when ready
        // const response = await fetch('/api/challenges');
        // const data = await response.json();
        // setChallenges(data.challenges);
        
        // For now, use mock data
        setChallenges(MOCK_CHALLENGES);
      } catch (error) {
        console.error('Failed to load challenges:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChallenges();
  }, []);

  if (learnerLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">Loading challenges...</div>
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Please log in to access challenges</p>
        </div>
      </div>
    );
  }

  // Filter challenges based on learner level
  const availableChallenges = challenges.filter(
    (c) => c.requiredLevel <= learner.level
  );

  const completedChallenges = challenges.filter((c) =>
    learner.challenges_completed.includes(c.id)
  );

  const inProgressChallenges = challenges.filter(
    (c) =>
      !learner.challenges_completed.includes(c.id) &&
      learner.challenges_unlocked.includes(c.id)
  );

  const stats = {
    total: challenges.length,
    completed: completedChallenges.length,
    inProgress: inProgressChallenges.length,
    available: availableChallenges.length,
    completionRate: Math.round((completedChallenges.length / challenges.length) * 100),
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">🎮 Challenges</h1>
            <p className="mt-2 text-slate-400">
              Master rover programming by solving challenges
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LevelBadge learner={learner} />
            <span className="text-sm text-slate-400">
              {learner.xp} XP
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Challenges"
            value={stats.completed}
            total={stats.total}
            icon="📚"
            color="blue"
          />
          <StatCard
            label="Completion"
            value={stats.completionRate}
            unit="%"
            icon="✅"
            color="green"
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            icon="⏳"
            color="yellow"
          />
          <StatCard
            label="Available"
            value={stats.available}
            icon="🔓"
            color="purple"
          />
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-700">
          <div className="flex gap-4">
            <TabButton
              label="Available"
              count={availableChallenges.length}
              active={activeTab === 'available'}
              onClick={() => setActiveTab('available')}
              icon="🔓"
            />
            <TabButton
              label="In Progress"
              count={inProgressChallenges.length}
              active={activeTab === 'progress'}
              onClick={() => setActiveTab('progress')}
              icon="⏳"
            />
            <TabButton
              label="Leaderboard"
              active={activeTab === 'leaderboard'}
              onClick={() => setActiveTab('leaderboard')}
              icon="🏆"
            />
            <TabButton
              label="Badges"
              count={learner.badges.length}
              active={activeTab === 'badges'}
              onClick={() => setActiveTab('badges')}
              icon="🏅"
            />
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'available' && (
            <AvailableChallengesTab
              challenges={availableChallenges}
              completedIds={learner.challenges_completed}
              onSelectChallenge={(challenge) => {
                setSelectedChallenge(challenge);
                setShowChallengeModal(true);
              }}
            />
          )}

          {activeTab === 'progress' && (
            <ProgressTab
              challenges={inProgressChallenges}
              completedIds={learner.challenges_completed}
              learnerStats={{
                totalSubmissions: learner.missionCount,
                successfulSubmissions: learner.completedMissions,
                xp: learner.xp,
                level: learner.level,
              }}
            />
          )}

          {activeTab === 'leaderboard' && (
            <LeaderboardTab />
          )}

          {activeTab === 'badges' && (
            <BadgesTab
              earnedBadges={learner.badges}
              allBadges={MOCK_BADGES}
            />
          )}
        </div>
      </div>

      {/* Challenge Detail Modal */}
      {showChallengeModal && selectedChallenge && (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          completed={learner.challenges_completed.includes(selectedChallenge.id)}
          onClose={() => {
            setShowChallengeModal(false);
            setSelectedChallenge(null);
          }}
          onStart={() => {
            // Navigate to code editor with challenge context
            const params = new URLSearchParams({
              mode: 'challenge',
              challengeId: selectedChallenge.id,
              challengeTitle: selectedChallenge.title,
              challengeDescription: selectedChallenge.description,
              difficulty: selectedChallenge.difficulty,
              xpReward: selectedChallenge.xpReward.toString(),
            });
            router.push(`/mission?${params.toString()}`);
          }}
        />
      )}
    </div>
  );
}

/**
 * Tab Button Component
 */
function TabButton({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-colors ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-slate-400 hover:text-slate-300'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {count !== undefined && (
        <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Stat Card Component
 */
function StatCard({
  label,
  value,
  total,
  unit,
  icon,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  unit?: string;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const bgColor = {
    blue: 'bg-blue-900/20 border-blue-700',
    green: 'bg-green-900/20 border-green-700',
    yellow: 'bg-yellow-900/20 border-yellow-700',
    purple: 'bg-purple-900/20 border-purple-700',
  };

  const textColor = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${bgColor[color]}`}>
      <div className="mb-2 text-2xl">{icon}</div>
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`text-2xl font-bold ${textColor[color]}`}>
        {value}
        {unit && <span className="text-lg">{unit}</span>}
        {total && <span className="text-lg text-slate-400"> / {total}</span>}
      </div>
    </div>
  );
}

/**
 * Available Challenges Tab
 */
function AvailableChallengesTab({
  challenges,
  completedIds,
  onSelectChallenge,
}: {
  challenges: Challenge[];
  completedIds: string[];
  onSelectChallenge: (challenge: Challenge) => void;
}) {
  if (challenges.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
        <p className="text-slate-400">
          No challenges available at your current level. Level up to unlock more!
        </p>
      </div>
    );
  }

  // Group by difficulty
  const byDifficulty = {
    beginner: challenges.filter((c) => c.difficulty === 'beginner'),
    intermediate: challenges.filter((c) => c.difficulty === 'intermediate'),
    advanced: challenges.filter((c) => c.difficulty === 'advanced'),
  };

  return (
    <div className="space-y-8">
      {byDifficulty.beginner.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-bold text-green-400">🟢 Beginner</h3>
          <ChallengeList
            challenges={byDifficulty.beginner.map((c) => ({
              ...c,
              status: completedIds.includes(c.id)
                ? ('completed' as const)
                : ('unlocked' as const),
            }))}
            onSelectChallenge={onSelectChallenge}
          />
        </div>
      )}

      {byDifficulty.intermediate.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-bold text-yellow-400">🟡 Intermediate</h3>
          <ChallengeList
            challenges={byDifficulty.intermediate.map((c) => ({
              ...c,
              status: completedIds.includes(c.id)
                ? ('completed' as const)
                : ('unlocked' as const),
            }))}
            onSelectChallenge={onSelectChallenge}
          />
        </div>
      )}

      {byDifficulty.advanced.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-bold text-red-400">🔴 Advanced</h3>
          <ChallengeList
            challenges={byDifficulty.advanced.map((c) => ({
              ...c,
              status: completedIds.includes(c.id)
                ? ('completed' as const)
                : ('unlocked' as const),
            }))}
            onSelectChallenge={onSelectChallenge}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Progress Tab
 */
function ProgressTab({
  challenges,
  completedIds,
  learnerStats,
}: {
  challenges: Challenge[];
  completedIds: string[];
  learnerStats: {
    totalSubmissions: number;
    successfulSubmissions: number;
    xp: number;
    level: number;
  };
}) {
  const successRate =
    learnerStats.totalSubmissions > 0
      ? Math.round((learnerStats.successfulSubmissions / learnerStats.totalSubmissions) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-blue-700 bg-blue-900/20 p-4">
          <div className="text-sm text-blue-400">Total Submissions</div>
          <div className="mt-1 text-3xl font-bold text-slate-100">
            {learnerStats.totalSubmissions}
          </div>
        </div>
        <div className="rounded-lg border border-green-700 bg-green-900/20 p-4">
          <div className="text-sm text-green-400">Success Rate</div>
          <div className="mt-1 text-3xl font-bold text-slate-100">
            {successRate}%
          </div>
        </div>
        <div className="rounded-lg border border-purple-700 bg-purple-900/20 p-4">
          <div className="text-sm text-purple-400">Current Level</div>
          <div className="mt-1 text-3xl font-bold text-slate-100">
            {learnerStats.level}
          </div>
        </div>
      </div>

      {/* In Progress Challenges */}
      {challenges.length > 0 ? (
        <div>
          <h3 className="mb-4 font-bold text-slate-300">Active Challenges</h3>
          <ChallengeList challenges={challenges} />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
          <p className="text-slate-400">No challenges in progress. Start a new one!</p>
        </div>
      )}
    </div>
  );
}

/**
 * Leaderboard Tab (Simplified)
 */
function LeaderboardTab() {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
      <div className="text-4xl mb-4">🏆</div>
      <h3 className="mb-2 text-lg font-bold text-slate-100">Leaderboard</h3>
      <p className="text-slate-400">View the full leaderboard at /leaderboard</p>
      <a
        href="/leaderboard"
        className="mt-4 inline-block rounded bg-blue-700 px-6 py-2 font-semibold text-blue-100 transition-colors hover:bg-blue-600"
      >
        Go to Leaderboard →
      </a>
    </div>
  );
}

/**
 * Badges Tab
 */
function BadgesTab({
  earnedBadges,
  allBadges,
}: {
  earnedBadges: string[];
  allBadges: typeof MOCK_BADGES;
}) {
  return (
    <div className="space-y-6">
      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div>
          <h3 className="mb-4 font-bold text-yellow-400">✨ Earned Badges ({earnedBadges.length})</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {earnedBadges.map((badgeId) => {
              const badge = allBadges.find((b) => b.id === badgeId);
              if (!badge) return null;

              return (
                <div
                  key={badge.id}
                  className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-4 text-center"
                >
                  <div className="mb-2 text-3xl">{badge.icon}</div>
                  <h4 className="font-semibold text-slate-100">{badge.name}</h4>
                  <p className="mt-1 text-xs text-slate-400">{badge.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked Badges */}
      <div>
        <h3 className="mb-4 font-bold text-slate-400">
          🔒 Locked Badges ({allBadges.length - earnedBadges.length})
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {allBadges
            .filter((b) => !earnedBadges.includes(b.id))
            .map((badge) => (
              <div
                key={badge.id}
                className="rounded-lg border border-slate-600 bg-slate-800/30 p-4 text-center opacity-50"
              >
                <div className="mb-2 text-3xl">🔒</div>
                <h4 className="font-semibold text-slate-400">{badge.name}</h4>
                <p className="mt-1 text-xs text-slate-500">{badge.description}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Challenge Detail Modal
 */
function ChallengeDetailModal({
  challenge,
  completed,
  onClose,
  onStart,
}: {
  challenge: Challenge;
  completed: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-2xl w-full rounded-lg border border-slate-700 bg-slate-800 p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">{challenge.title}</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300">
                {challenge.difficulty}
              </span>
              <span className="text-sm text-slate-400">📂 {challenge.category}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 transition-colors hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <div className="mb-4">
          <p className="text-slate-300">{challenge.description}</p>
        </div>

        {/* Rewards */}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          <div className="rounded bg-blue-900/20 p-3 text-center">
            <div className="text-sm text-blue-400">XP Reward</div>
            <div className="text-xl font-bold text-blue-300">+{challenge.xpReward}</div>
          </div>
          <div className="rounded bg-yellow-900/20 p-3 text-center">
            <div className="text-sm text-yellow-400">Space Rocks</div>
            <div className="text-xl font-bold text-yellow-300">
              {challenge.difficulty === 'beginner'
                ? '+1'
                : challenge.difficulty === 'intermediate'
                ? '+2'
                : '+3'}
            </div>
          </div>
          {challenge.badgeReward && (
            <div className="rounded bg-purple-900/20 p-3 text-center">
              <div className="text-sm text-purple-400">Badge</div>
              <div className="text-xl font-bold text-purple-300">🏆</div>
            </div>
          )}
        </div>

        {/* Hints */}
        <div className="mb-6">
          <h3 className="mb-2 font-semibold text-slate-300">💡 Available Hints</h3>
          <div className="space-y-2">
            {challenge.hints.map((hint, i) => (
              <div key={i} className="rounded bg-slate-700/30 p-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-300">Hint {i + 1}:</span> {hint.text}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-slate-700 px-4 py-2 font-semibold text-slate-100 transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            disabled={completed}
            className={`flex-1 rounded px-4 py-2 font-semibold transition-colors ${
              completed
                ? 'bg-green-700/50 text-green-300 cursor-not-allowed'
                : 'bg-blue-700 text-blue-100 hover:bg-blue-600'
            }`}
          >
            {completed ? '✅ Completed' : 'Start Challenge →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mock data for development
 */
const MOCK_CHALLENGES: Challenge[] = [
  {
    id: 'draw-line',
    title: 'Draw a Line',
    description: 'Draw a straight line from point A to point B',
    category: 'shapes',
    difficulty: 'beginner',
    requiredLevel: 1,
    prerequisites: [],
    xpReward: 25,
    points: 25,
    hints: [
      { level: 1, text: 'Use the forward command to move the rover' },
      { level: 2, text: 'The rover draws automatically as it moves' },
      { level: 3, text: 'Try: forward(100)' },
    ],
    expectedOutput: {
      shapes: [{ shape: 'line', length: 100 }],
      tolerance: 5,
    },
    orderIndex: 1,
  },
  {
    id: 'draw-square',
    title: 'Draw a Square',
    description: 'Draw a perfect square using the rover',
    category: 'shapes',
    difficulty: 'beginner',
    requiredLevel: 1,
    prerequisites: ['draw-line'],
    xpReward: 50,
    points: 50,
    hints: [
      { level: 1, text: 'A square has 4 equal sides' },
      { level: 2, text: 'You need to turn 90 degrees between each side' },
      { level: 3, text: 'Use a loop to repeat the pattern' },
    ],
    expectedOutput: {
      shapes: [{ shape: 'square', width: 100, height: 100 }],
      tolerance: 5,
    },
    orderIndex: 2,
  },
  {
    id: 'draw-circle',
    title: 'Draw a Circle',
    description: 'Draw a circle using the rover',
    category: 'shapes',
    difficulty: 'intermediate',
    requiredLevel: 2,
    prerequisites: ['draw-square'],
    xpReward: 75,
    points: 75,
    hints: [
      { level: 1, text: 'A circle is made of many small line segments' },
      { level: 2, text: 'Turn a small amount repeatedly' },
      { level: 3, text: 'Use a loop with small forward and turn commands' },
    ],
    expectedOutput: {
      shapes: [{ shape: 'circle', radius: 50 }],
      tolerance: 10,
    },
    orderIndex: 3,
  },
];

const MOCK_BADGES = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Complete your first challenge',
    icon: '👣',
  },
  {
    id: 'shape-starter',
    name: 'Shape Starter',
    description: 'Complete all beginner challenges',
    icon: '🟢',
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Earn 100 XP',
    icon: '💪',
  },
  {
    id: 'master-coder',
    name: 'Master Coder',
    description: 'Reach Level 5',
    icon: '👑',
  },
];

// Default export for Next.js App Router
export default ChallengesPage;