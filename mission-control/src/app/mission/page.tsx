import { MissionWorkspace } from '@/components/mission/MissionWorkspace';
import { Suspense } from 'react';

export default function MissionPage() {
  // TODO: User Story 17 - browser editor experience.
  // TODO: User Story 21 - allowlist enforcement before submission.
  // TODO: User Story 27 - simulator workflow.
  // TODO: User Story 54 - queue confirmation and polling UX.
  // TODO: User Story 58 - completion notification UX.
  return (
    <main className="relative h-[calc(100vh-64px)] overflow-hidden px-3 py-2">
      <div className="mx-auto max-w-7xl space-y-2">
        <header className="max-w-3xl space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-accent">
            Learner Workspace
          </p>
          <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">
            Mission Authoring And Simulation
          </h1>
        </header>

        <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">Loading workspace...</div>}>
          <MissionWorkspace />
        </Suspense>
      </div>
    </main>
  );
}
