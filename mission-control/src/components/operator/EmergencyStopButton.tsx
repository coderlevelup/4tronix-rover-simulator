import { ScaffoldCard } from '@/components/ui/ScaffoldCard';

export function EmergencyStopButton() {
  // TODO: User Story 77 / Tasks 78-80 - connect UI control to the GSA emergency stop path.
  return (
    <ScaffoldCard
      eyebrow="Safety"
      title="Emergency Stop"
      body="Placeholder for the operator-side emergency stop trigger."
      todos={[
        'TODO: User Story 77 / Task 79 - wire this button into the operator console UX.',
        'TODO: User Story 77 / Task 78 - send the halt signal to the Ground Station Agent.',
        'TODO: User Story 77 / Task 80 - verify immediate stop behavior in tests.',
      ]}
    >
      <button
        className="w-full rounded-2xl border border-red-400/40 bg-red-500/15 px-4 py-5 text-base font-semibold text-red-200"
        type="button"
      >
        TODO: Trigger emergency stop
      </button>
    </ScaffoldCard>
  );
}
