'use client';

import { RoverConfigModule } from '@/components/operator/RoverConfigModule';
import { YardServerHealth } from '@/components/operator/YardServerHealth';

export default function RoverConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-50">Yard Configuration</h1>
        <p className="text-slate-400 mt-1">
          Configure rover endpoints for the active yard. The yard server runs locally on the satellite Pi
          and connects to physical or simulated rovers — see{' '}
          <span className="font-mono text-slate-300">yard/rover/rover_server.py</span>.
        </p>
      </div>

      {/* Live yard server connection status */}
      <YardServerHealth />

      <RoverConfigModule />
    </div>
  );
}
