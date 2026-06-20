import { ScaffoldCard } from '@/components/shared/ScaffoldCard';

export function RoverEditorScaffold() {
  // TODO: User Story 17 / Tasks 18-20 - replace placeholder textarea with Monaco integration.
  // TODO: User Story 21 / Tasks 22-25 - connect static analysis, command allowlist, and blocked import feedback.
  return (
    <ScaffoldCard
      eyebrow="Learner Editor"
      title="Mission Editor"
      body="Scaffold for the browser-based rover coding experience."
      todos={[
        'TODO: User Story 17 / Task 18 - integrate Monaco editor into this panel.',
        'TODO: User Story 17 / Task 19 - add Python syntax support and rover autocomplete.',
        'TODO: User Story 21 / Task 23 - run allowlist checks before submission.',
        'TODO: User Story 35 / Task 38 - keep anonymous mission submission wired from this workspace.',
      ]}
    >
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4">
        <pre className="overflow-x-auto text-sm leading-6 text-emerald-300">
          {`# TODO: User Story 17 - editor scaffold
# Replace this placeholder with Monaco and rover snippets.
rover.forward(100)
rover.wait(2)
rover.turn_left(90)`}
        </pre>
      </div>
    </ScaffoldCard>
  );
}
