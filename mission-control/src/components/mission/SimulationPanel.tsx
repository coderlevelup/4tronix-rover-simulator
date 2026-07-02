'use client';

import { RoverSimulator } from '@/components/mission/RoverSimulator';

/**
 * Right-hand simulation column. Thin layout wrapper around RoverSimulator;
 * props are derived from it so they stay in sync automatically.
 */
type SimulationPanelProps = React.ComponentProps<typeof RoverSimulator>;

export function SimulationPanel(props: SimulationPanelProps) {
  return (
    <div className="min-w-0 h-full overflow-hidden">
      <RoverSimulator {...props} />
    </div>
  );
}
