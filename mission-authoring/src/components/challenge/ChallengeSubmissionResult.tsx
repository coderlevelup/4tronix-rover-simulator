/**
 * Challenge Submission Result Component
 * Displays comprehensive feedback after challenge submission
 * Shows validation, XP, level up, and badges
 */

'use client';

import { useEffect, useState, useRef } from 'react';

interface ChallengeSubmissionResultProps {
  passed: boolean;
  score: number;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel?: number;
  badgesAwarded: string[];
  explanation: string;
  error?: string;
  onDismiss?: () => void;
  onNextChallenge?: () => void;
}

export function ChallengeSubmissionResult({
  passed,
  score,
  xpAwarded,
  leveledUp,
  newLevel,
  badgesAwarded,
  explanation,
  error,
  onDismiss,
  onNextChallenge,
}: ChallengeSubmissionResultProps) {
  const [showConfetti, setShowConfetti] = useState(passed);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (passed) {
      // Trigger confetti animation
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [passed]);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.width = `${score}%`;
    }
  }, [score]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/20 p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl">❌</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-red-400">Submission Error</h2>
            <p className="mt-2 text-sm text-red-300">{error}</p>
            <button
              onClick={onDismiss}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-red-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-6 transition-all ${
        passed
          ? 'border-green-700 bg-green-900/20'
          : 'border-yellow-700 bg-yellow-900/20'
      }`}
    >
      {/* Confetti effect */}
      {showConfetti && <Confetti />}

      {/* Result icon and headline */}
      <div className="mb-4 flex items-center gap-3">
        <div className="text-5xl">{passed ? '🎉' : '⏳'}</div>
        <div>
          <h2 className={`text-2xl font-bold ${
            passed ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {passed ? 'Challenge Completed!' : 'Try Again'}
          </h2>
          <p className={`text-sm ${
            passed ? 'text-green-300' : 'text-yellow-300'
          }`}>
            {explanation}
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-slate-400">Accuracy</span>
          <span className="font-bold text-slate-100">{score}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
          <div
              ref={progressRef}
              className={`h-full transition-all duration-700 ${
                passed ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
        </div>
      </div>

      {/* Rewards section */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* XP */}
        <div className="rounded border border-blue-700 bg-blue-900/20 p-4 text-center">
          <div className="text-3xl font-bold text-blue-400">+{xpAwarded}</div>
          <div className="text-xs text-blue-300">XP Earned</div>
        </div>

        {/* Level up */}
        {leveledUp && (
          <div className="rounded border border-purple-700 bg-purple-900/20 p-4 text-center animate-pulse">
            <div className="text-3xl font-bold text-purple-400">⬆️</div>
            <div className="text-xs text-purple-300">Level {newLevel}!</div>
          </div>
        )}

        {/* Badges */}
        {badgesAwarded.length > 0 && (
          <div className="rounded border border-yellow-700 bg-yellow-900/20 p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">
              +{badgesAwarded.length}
            </div>
            <div className="text-xs text-yellow-300">Badge{badgesAwarded.length === 1 ? '' : 's'}!</div>
          </div>
        )}
      </div>

      {/* Badges list */}
      {badgesAwarded.length > 0 && (
        <div className="mt-4 rounded bg-slate-800/30 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-300">
            🏆 Badges Unlocked
          </p>
          <div className="space-y-1">
            {badgesAwarded.map((badgeId) => (
              <div key={badgeId} className="text-xs text-slate-300">
                ✨ {badgeId}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex gap-3">
        {passed && onNextChallenge && (
          <button
            onClick={onNextChallenge}
            className="flex-1 rounded bg-green-700 px-4 py-3 font-semibold text-slate-100 hover:bg-green-600"
          >
            Next Challenge →
          </button>
        )}
        {!passed && onNextChallenge && (
          <button
            onClick={onNextChallenge}
            className="flex-1 rounded bg-yellow-700 px-4 py-3 font-semibold text-slate-100 hover:bg-yellow-600"
          >
            Try Again
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-1 rounded bg-slate-700 px-4 py-3 font-semibold text-slate-100 hover:bg-slate-600"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Confetti animation
 */
function Confetti() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Create particles programmatically to avoid JSX inline styles
    const particles: HTMLDivElement[] = [];
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'animate-bounce absolute';
      p.textContent = ['🎉', '🎊', '✨', '⭐', '🌟'][Math.floor(Math.random() * 5)];
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `-10px`;
      p.style.animation = `fall ${2 + Math.random() * 1}s linear forwards`;
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      el.appendChild(p);
      particles.push(p);
    }

    const cleanup = () => {
      particles.forEach((p) => p.remove());
    };

    // Remove after longest animation
    const timeout = setTimeout(cleanup, 3500);
    return () => {
      clearTimeout(timeout);
      cleanup();
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none fixed inset-0 overflow-hidden">
      <style jsx>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Compact result badge
 */
export function ResultBadge({
  passed,
  score,
}: {
  passed: boolean;
  score: number;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${
        passed
          ? 'border-green-700 bg-green-900/20 text-green-400'
          : 'border-yellow-700 bg-yellow-900/20 text-yellow-400'
      }`}
    >
      <span>{passed ? '✓' : '⏳'}</span>
      <span>{score}%</span>
    </div>
  );
}