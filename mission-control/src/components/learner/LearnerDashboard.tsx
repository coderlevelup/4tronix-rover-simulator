'use client';

/**
 * Learner Dashboard Component
 *
 * Example integration showing how to use the anonymous learner system
 * in a mission submission workflow.
 */

import { useState, useEffect } from 'react';
import { useLearner } from '@/contexts/LearnerContext';
import { LearnerProfileCard } from './LearnerProfileCard';
import { getMissionsByLearnerId } from '@/lib/services/missionQueryService';

interface MissionHistoryItem {
  id: string;
  status: string;
  submittedAt: string;
}

export function LearnerDashboard() {
  const { learner, sessionId, loading } = useLearner();
  const [recentMissions, setRecentMissions] = useState<MissionHistoryItem[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    void (async () => {
      try {
        const missions = await getMissionsByLearnerId(sessionId);
        setRecentMissions(
          missions.slice(0, 5).map((mission) => ({
            id: mission.id,
            status: mission.status,
            submittedAt: mission.submittedAt,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch recent missions:', error);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-slate-400">Loading your profile...</div>
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

  return (
    <div className="space-y-6">
      {/* Learner Profile */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Your Profile</h2>
        <LearnerProfileCard />
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Recent Missions</h2>

        {recentMissions.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
            <p className="text-slate-400">No missions yet. Start coding to see your history!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentMissions.map((mission) => (
              <div
                key={mission.id}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4"
              >
                <div>
                  <p className="font-mono text-sm text-slate-300">Mission #{mission.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(mission.submittedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <StatusBadge status={mission.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Stats */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Statistics</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label="Total Missions"
            value={learner.missionCount}
            icon="🚀"
            color="blue"
          />
          <StatCard
            label="Completed"
            value={learner.completedMissions}
            icon="✅"
            color="green"
          />
          <StatCard
            label="Success Rate"
            value={
              learner.missionCount > 0
                ? `${Math.round((learner.completedMissions / learner.missionCount) * 100)}%`
                : '0%'
            }
            icon="📊"
            color="purple"
          />
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    queued: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
    processing: 'bg-blue-900/50 text-blue-400 border-blue-700',
    completed: 'bg-green-900/50 text-green-400 border-green-700',
    failed: 'bg-red-900/50 text-red-400 border-red-700',
    cancelled: 'bg-gray-900/50 text-gray-400 border-gray-700',
  };

  const style = styles[status as keyof typeof styles] || styles.queued;

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'green' | 'purple';
}) {
  const colorStyles = {
    blue: 'border-blue-700 bg-blue-900/20',
    green: 'border-green-700 bg-green-900/20',
    purple: 'border-purple-700 bg-purple-900/20',
  };

  return (
    <div className={`rounded-lg border p-6 ${colorStyles[color]}`}>
      <div className="mb-2 text-2xl">{icon}</div>
      <div className="text-3xl font-bold text-slate-100">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}
