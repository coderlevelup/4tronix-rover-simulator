'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mission } from '@/core/domain/entities/Mission';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionCard } from '@/components/MissionCard/MissionCard';
import { CHALLENGES, Challenge } from '@/data/challenges';
import { useLearner } from '@/contexts/LearnerContext';
import { LevelDisplay } from '@/components/challenge/LevelDisplay';

type Tab = 'community' | 'challenges';

const DIFFICULTY_STYLES: Record<Challenge['difficulty'], string> = {
  beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  intermediate: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  advanced: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function MissionCataloguePage() {
  const router = useRouter();
  const { learner } = useLearner();
  const completedChallengeIds = new Set(learner?.challenges_completed ?? []);
  const completedCount = CHALLENGES.filter((c) => completedChallengeIds.has(c.id)).length;
  const [tab, setTab] = useState<Tab>('community');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const repository = new FirestoreMissionRepository(getFirestoreClient());
        const loadedMissions = await repository.findAll();

        const completedMissions = loadedMissions.filter(
          (m) => m.status === 'completed' || Boolean(m.videoUrl || m.youtubeUrl)
        );

        setMissions(completedMissions);
        setAllMissions(completedMissions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTryChallenge = (challenge: Challenge) => {
    const params = new URLSearchParams({
      mode: 'code',
      challengeId: challenge.id,
      code: challenge.starterCode ?? '',
      challengeTitle: challenge.title,
      challengeDescription: challenge.description,
      difficulty: challenge.difficulty,
      xpReward: String(challenge.xpReward),
    });

    router.push(`/mission?${params.toString()}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      {/* Hero */}
      <div className="pt-16 pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl p-6 backdrop-blur border border-slate-800 bg-slate-900/60 shadow-xl">
            <h1 className="text-3xl font-extrabold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-rose-500">
              Mission Catalogue
            </h1>
            <p className="text-slate-400 max-w-2xl">
              Explore completed rover missions or try a guided challenge to build your skills.
            </p>

            {/* Tabs */}
            <div className="mt-5 flex gap-2">
              {(['community', 'challenges'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-full font-semibold text-sm transition-colors ${
                    tab === t
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'community' ? 'Community Missions' : 'Challenges'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">

        {/* Community missions tab */}
        {tab === 'community' && (
          <>
            <div className="mb-6">
              <input
                aria-label="Search missions"
                className="w-full bg-slate-800 border border-slate-800 rounded-full px-4 py-2 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-orange-500/40"
                placeholder="Search by mission name, yard or challenge"
                onChange={(e) => {
                  const q = e.target.value.toLowerCase();

                  setMissions(
                    q
                      ? allMissions.filter((m) =>
                          `${m.name ?? ''} ${m.id} ${m.yardId} ${m.challengeId ?? ''}`
                            .toLowerCase()
                            .includes(q)
                        )
                      : allMissions
                  );
                }}
              />
            </div>

            {loading ? (
              <div className="py-24 text-center">
                <p className="mt-4 text-slate-300">Loading missions...</p>
              </div>
            ) : error ? (
              <div className="py-24 text-center">
                <p className="text-red-400">{error}</p>
              </div>
            ) : missions.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-2xl font-bold text-slate-300">No missions yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {missions.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} showChallengeBadge />
                ))}
              </div>
            )}
          </>
        )}

        {/* Challenges tab */}
        {tab === 'challenges' && (
          <div className="space-y-4">
            {/* Progress summary */}
            {learner && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-300">Your progress</p>
                  <p className="text-sm text-slate-400">
                    <span className="font-bold text-orange-400">{completedCount}</span>
                    {' / '}
                    {CHALLENGES.length} challenges completed
                  </p>
                </div>
                <LevelDisplay learner={learner} />
              </div>
            )}

            <p className="text-sm text-slate-500">
              Complete these missions in order to build up your rover programming skills.
            </p>

            {CHALLENGES.map((challenge, index) => {
              const isCompleted = completedChallengeIds.has(challenge.id);
              return (
              <article
                key={challenge.id}
                className={`overflow-hidden rounded-2xl border bg-slate-900 ${
                  isCompleted ? 'border-green-600/50' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                        isCompleted
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{challenge.title}</h3>
                        {isCompleted && (
                          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-400">
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {challenge.description}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    <span className="hidden sm:inline text-xs font-semibold text-orange-400">
                      +{challenge.xpReward} XP
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        DIFFICULTY_STYLES[challenge.difficulty]
                      }`}
                    >
                      {challenge.difficulty}
                    </span>

                    <button
                      onClick={() => handleTryChallenge(challenge)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${
                        isCompleted
                          ? 'bg-slate-700 hover:bg-slate-600'
                          : 'bg-orange-500 hover:bg-orange-400'
                      }`}
                    >
                      {isCompleted ? 'Try again' : 'Try it →'}
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Starter Code
                  </p>

                  {challenge.starterCode ? (
                    <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300 max-h-40">
                      <code>{challenge.starterCode?.trim() ?? ''}</code>
                    </pre>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No starter code provided
                    </p>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}