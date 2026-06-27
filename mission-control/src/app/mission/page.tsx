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
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">
            Build your <span className="text-gradient-mars">Mission</span>
          </h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            Drive it, snap blocks together, or write Python, then send it to a real rover.
          </p>
        </header>

        <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Loading workspace...</div>}>
          <MissionWorkspace />
        </Suspense>
      </div>
    </main>
  );
}
