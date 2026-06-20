import { LeaderboardView } from '@/components/challenge/LeaderboardView';

export default function LeaderboardPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50">
          <div className="mb-8 space-y-3">
            <p className="text-sm uppercase tracking-[0.24em] text-orange-400">Challenge Leaderboard</p>
            <h1 className="text-4xl font-bold text-white sm:text-5xl">Top Rover Cadets</h1>
            <p className="max-w-2xl text-slate-400">
              Compare progress with other learners, track your rank, and see XP standings for challenge completion.
            </p>
          </div>

          <LeaderboardView />
        </div>
      </div>
    </main>
  );
}
