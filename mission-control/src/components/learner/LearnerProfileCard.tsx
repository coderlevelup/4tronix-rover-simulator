'use client';

/**
 * Learner Profile Card Component
 *
 * Displays anonymous learner identity and stats.
 * Allows optional display name customization.
 */

import { useState } from 'react';
import { useLearner } from '@/contexts/LearnerContext';
import { getShortSessionId } from '@/lib/anonymous-auth';

export function LearnerProfileCard() {
  const { learner, sessionId, updateDisplayName } = useLearner();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  if (!learner || !sessionId) {
    return null;
  }

  const handleSave = async () => {
    try {
      setError('');
      await updateDisplayName(displayName);
      setIsEditing(false);
      setDisplayName('');
    } catch (err) {
      setError('Invalid name. Please avoid personal information.');
    }
  };

  const shortId = getShortSessionId(sessionId);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: learner.avatarColor }}
          >
            {learner.displayName?.[0]?.toUpperCase() || '?'}
          </div>

          {/* Profile Info */}
          <div>
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter nickname (optional)"
                  className="rounded border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-slate-100"
                  maxLength={20}
                  autoFocus
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setError('');
                      setDisplayName('');
                    }}
                    className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-100">
                    {learner.displayName || `Learner ${shortId}`}
                  </h3>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-xs text-slate-400">Session: {shortId}</p>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-100">{learner.missionCount}</div>
          <div className="text-xs text-slate-400">Missions</div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4">
        <div>
          <div className="text-lg font-semibold text-green-400">{learner.completedMissions}</div>
          <div className="text-xs text-slate-400">Completed</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-blue-400">
            {learner.missionCount > 0
              ? Math.round((learner.completedMissions / learner.missionCount) * 100)
              : 0}
            %
          </div>
          <div className="text-xs text-slate-400">Success Rate</div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="mt-4 rounded bg-slate-900/50 p-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">🔒 Privacy:</span> Your session is stored
        locally. No email or personal data required.
      </div>
    </div>
  );
}
