'use client';

/**
 * Simple Example: Using getLearnerID()
 *
 * This component demonstrates the complete learner ID system:
 * - Automatic ID generation on mount
 * - localStorage persistence
 * - Firestore synchronization
 * - Mission tracking
 */

import { useEffect, useState } from 'react';
import { getLearnerID, clearLearnerID } from '@/lib/getLearnerID';
import {
  initializeLearner,
  incrementMissionsCompleted,
  updateProgress,
  LearnerRecord,
} from '@/lib/initializeLearner';

export function SimpleLearnerExample() {
  const [learner, setLearner] = useState<LearnerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize on mount (app startup)
  useEffect(() => {
    initializeLearnerOnStartup();
  }, []);

  async function initializeLearnerOnStartup() {
    try {
      console.log('🚀 Initializing learner on app startup...');

      // Step 1: Get or generate learner ID (stored in localStorage)
      const learnerId = getLearnerID();
      console.log('✅ Learner ID:', learnerId);

      // Step 2: Initialize Firestore document (auto-creates if new)
      const record = await initializeLearner();
      console.log('✅ Learner record:', record);

      setLearner(record);
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleMissionComplete() {
    if (!learner) return;

    // Increment missions completed in Firestore
    await incrementMissionsCompleted(learner.learnerId);

    // Update local state
    setLearner({
      ...learner,
      missionsCompleted: learner.missionsCompleted + 1,
    });

    // Update progress (example: 10% per mission, max 100%)
    const newProgress = Math.min((learner.missionsCompleted + 1) * 10, 100);
    await updateProgress(learner.learnerId, newProgress);

    console.log('✅ Mission completed!');
  }

  async function handleResetLearner() {
    // Clear localStorage and regenerate new ID
    clearLearnerID();

    // Re-initialize with new ID
    await initializeLearnerOnStartup();

    console.log('🔄 Learner reset - new ID generated');
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
        <div className="text-slate-400">Initializing learner session...</div>
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/20 p-8 text-center">
        <div className="text-red-400">Failed to initialize learner</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Learner Info */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Learner Profile</h2>

        <div className="space-y-3">
          <div>
            <div className="text-sm text-slate-400">Learner ID</div>
            <div className="font-mono text-sm text-slate-100">{learner.learnerId}</div>
          </div>

          <div>
            <div className="text-sm text-slate-400">Created</div>
            <div className="text-sm text-slate-100">
              {(() => {
                const iso =
                  typeof learner.createdAt === 'string'
                    ? learner.createdAt
                    : learner.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString();
                return new Date(iso).toLocaleString();
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400">Missions Completed</div>
              <div className="text-2xl font-bold text-green-400">{learner.missionsCompleted}</div>
            </div>

            <div>
              <div className="text-sm text-slate-400">Progress</div>
              <div className="text-2xl font-bold text-blue-400">{learner.progress}%</div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${learner.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={handleMissionComplete}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
        >
          ✅ Complete Mission (Demo)
        </button>

        <button
          onClick={handleResetLearner}
          className="w-full rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 font-semibold text-red-400 hover:bg-red-900/40"
        >
          🔄 Reset Learner (Generate New ID)
        </button>
      </div>

      {/* How It Works */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
        <h3 className="mb-3 text-lg font-semibold text-slate-100">How It Works</h3>

        <ul className="space-y-2 text-sm text-slate-400">
          <li>
            ✅ <strong>On App Startup:</strong> getLearnerID() retrieves or generates unique ID
          </li>
          <li>
            ✅ <strong>localStorage:</strong> ID persists across page reloads
          </li>
          <li>
            ✅ <strong>Firestore:</strong> Document auto-created at{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5">learners/{'{'}learnerId{'}'}</code>
          </li>
          <li>
            ✅ <strong>Cache Cleared:</strong> New ID generated, new Firestore document created
          </li>
          <li>
            ✅ <strong>Privacy:</strong> No email, password, or PII required
          </li>
        </ul>
      </div>

      {/* Firestore Document Preview */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
        <h3 className="mb-3 text-lg font-semibold text-slate-100">
          Firestore Document Structure
        </h3>

        <pre className="overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-300">
          {JSON.stringify(
            {
              learnerId: learner.learnerId,
              createdAt: learner.createdAt,
              missionsCompleted: learner.missionsCompleted,
              progress: learner.progress,
              lastActiveAt: '(server timestamp)',
            },
            null,
            2
          )}
        </pre>

        <p className="mt-3 text-xs text-slate-500">
          Path: <code className="rounded bg-slate-800 px-1 py-0.5">learners/{learner.learnerId}</code>
        </p>
      </div>
    </div>
  );
}
