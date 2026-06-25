import { MissionHistoryScaffold } from '@/components/mission/MissionHistoryScaffold';

export default function HistoryPage() {
  // TODO: User Story 54 / Task 56 - learner mission status polling and history page.
  // TODO: User Story 58 - completed mission follow-up and video notification history.
  return (
    <main className="relative min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="max-w-3xl space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            Learner Missions
          </p>
          <h1 className="font-display text-4xl font-bold text-foreground md:text-5xl">Mission History</h1>
          <p className="text-base leading-7 text-muted-foreground">
            Scaffold route for learner-visible queue and completion history.
          </p>
        </header>

        <MissionHistoryScaffold />
      </div>
    </main>
  );
}
