/**
 * Leaderboard View Component
 * Displays top learners ranked by XP with pagination
 */

'use client';

import { useState, useEffect } from 'react';
import { useLeaderboard } from '@/hooks/useChallengeSubmit';
import { getLevelName } from '@/core/domain/entities/Learner';
import { getLearnerID } from '@/lib/getLearnerID';

interface LeaderboardViewProps {
  currentLearnerId?: string;
  limit?: number;
}

export function LeaderboardView({
  currentLearnerId,
  limit = 50,
}: LeaderboardViewProps) {
  const { fetchLeaderboard, fetchLearnerRank, leaderboard, isLoading, error } =
    useLeaderboard();
  const [currentRank, setCurrentRank] = useState<any | null>(null);
  const [offset, setOffset] = useState(0);

  // When no learner id is passed in, fall back to this browser's learner id so
  // the visitor always sees their own "Your Rank" card and highlighted row.
  const [resolvedLearnerId, setResolvedLearnerId] = useState<string | undefined>(
    currentLearnerId
  );

  useEffect(() => {
    if (currentLearnerId) {
      setResolvedLearnerId(currentLearnerId);
      return;
    }
    try {
      setResolvedLearnerId(getLearnerID());
    } catch {
      setResolvedLearnerId(undefined);
    }
  }, [currentLearnerId]);

  useEffect(() => {
    void (async () => {
      await fetchLeaderboard(limit, offset);

      if (resolvedLearnerId) {
        const rank = await fetchLearnerRank(resolvedLearnerId);
        setCurrentRank(rank);
      }
    })();
  }, [offset, limit, resolvedLearnerId, fetchLeaderboard, fetchLearnerRank]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/20 p-4">
        <p className="text-red-400">Failed to load leaderboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Learner's rank */}
      {currentRank && (
        <div className="rounded-lg border border-blue-700 bg-blue-900/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-400">Your Rank</p>
              <p className="text-2xl font-bold text-slate-100">
                #{currentRank.rank}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Level {currentRank.level}</p>
              <p className="text-xl font-bold text-slate-100">
                {currentRank.xp} XP
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 border-b border-slate-700 bg-slate-900/50 px-4 py-3">
          <div className="col-span-1 text-xs font-semibold text-slate-400 uppercase">
            Rank
          </div>
          <div className="col-span-6 text-xs font-semibold text-slate-400 uppercase">
            Player
          </div>
          <div className="col-span-2 text-xs font-semibold text-slate-400 uppercase">
            Level
          </div>
          <div className="col-span-3 text-xs font-semibold text-slate-400 uppercase text-right">
            XP
          </div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">
            Loading leaderboard...
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No learners on leaderboard yet
          </div>
        ) : (
          <div>
            {leaderboard.map((entry, index) => (
              <div
                key={entry.learnerId}
                className={`grid grid-cols-12 gap-2 border-b border-slate-700/50 px-4 py-3 transition-colors hover:bg-slate-700/30 ${
                  entry.learnerId === resolvedLearnerId
                    ? 'bg-blue-900/20'
                    : index % 2 === 0
                    ? 'bg-slate-800/30'
                    : ''
                }`}
              >
                {/* Rank */}
                <div className="col-span-1 flex items-center font-bold text-slate-100">
                  {entry.rank === 1 && '🥇'}
                  {entry.rank === 2 && '🥈'}
                  {entry.rank === 3 && '🥉'}
                  {entry.rank > 3 && entry.rank}
                </div>

                {/* Player name */}
                <div className="col-span-6">
                  <p className="font-semibold text-slate-100">
                    {entry.displayName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.learnerId.slice(0, 8)}...
                  </p>
                </div>

                {/* Level */}
                <div className="col-span-2 flex items-center">
                  <div className="rounded bg-slate-700/50 px-2 py-1 text-sm font-semibold text-slate-100">
                    {entry.level}
                  </div>
                </div>

                {/* XP */}
                <div className="col-span-3 flex items-center justify-end text-right">
                  <div>
                    <p className="text-lg font-bold text-yellow-400">
                      {entry.xp}
                    </p>
                    <p className="text-xs text-slate-400">XP</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {leaderboard.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || isLoading}
            className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50 hover:bg-slate-600"
          >
            ← Previous
          </button>

          <div className="text-sm text-slate-400">
            Showing {offset + 1}-{Math.min(offset + limit, offset + leaderboard.length)}
          </div>

          <button
            onClick={() => setOffset(offset + limit)}
            disabled={leaderboard.length < limit || isLoading}
            className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50 hover:bg-slate-600"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}