'use client';

import { RoverSimulatorScaffold } from '@/components/mission/RoverSimulatorScaffold';

/**
 * Right-hand simulation column. Thin layout wrapper around RoverSimulatorScaffold;
 * props are derived from it so they stay in sync automatically.
 */
type SimulationPanelProps = React.ComponentProps<typeof RoverSimulatorScaffold>;

export function SimulationPanel(props: SimulationPanelProps) {
  return (
    <div className="min-w-0 h-full overflow-hidden">
      <RoverSimulatorScaffold {...props} />
    </div>
  );
}
