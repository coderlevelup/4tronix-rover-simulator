'use client';

import { useState, useEffect } from 'react';
import { ScaffoldCard } from '@/components/ui/ScaffoldCard';
import type { YardStatus } from '@/core/domain/entities/Yard';

const YARD_ID = 'yard-1';

const MODE_CONFIG: Record<YardStatus, { label: string; color: string; bgColor: string; description: string }> = {
  offline: {
    label: 'Offline',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/15',
    description: 'Yard is switched off. Rover cannot move and operations are disabled.',
  },
  remote: {
    label: 'Remote',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/15',
    description: 'Operator can run the rover remotely. Run on rover button is enabled.',
  },
  'on-site': {
    label: 'On-Site',
    color: 'text-green-300',
    bgColor: 'bg-green-500/15',
    description: 'Both operator and kids at the centre can run the rover from tablets.',
  },
};

export function YardControl() {
  const [currentMode, setCurrentMode] = useState<YardStatus>('offline');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchYardStatus();
  }, []);

  const fetchYardStatus = async () => {
    try {
      const response = await fetch(`/api/operator/yard/${YARD_ID}/status`);
      const data = await response.json();
      if (data.success && data.yard) {
        setCurrentMode(data.yard.status);
      }
    } catch (error) {
      console.error('Failed to fetch yard status:', error);
    }
  };

  const handleModeChange = async (newMode: YardStatus) => {
    if (newMode === currentMode || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/operator/yard/${YARD_ID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newMode }),
      });

      const data = await response.json();
      if (data.success && data.yard) {
        setCurrentMode(data.yard.status);
      }
    } catch (error) {
      console.error('Failed to update yard status:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScaffoldCard
      eyebrow="Yard Controls"
      title="Yard Mode"
      body="Control the operational mode of the yard. Offline: yard is switched off. Remote: operator control only. On-Site: operator and local tablet access."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 p-4 text-sm">
          <span className="text-slate-300">Current Mode</span>
          <span className={`rounded-full px-3 py-1 font-medium ${MODE_CONFIG[currentMode].bgColor} ${MODE_CONFIG[currentMode].color}`}>
            {MODE_CONFIG[currentMode].label}
          </span>
        </div>

        <div className="space-y-2">
          {(Object.entries(MODE_CONFIG) as [YardStatus, typeof MODE_CONFIG[YardStatus]][]).map(([mode, config]) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              disabled={loading || mode === currentMode}
              className={`
                w-full rounded-xl p-4 text-left transition-all
                ${mode === currentMode
                  ? `${config.bgColor} ${config.color} ring-2 ring-inset ${config.color.replace('text-', 'ring-')}`
                  : 'bg-slate-900/50 text-slate-400 hover:bg-slate-900/80 hover:text-slate-300'
                }
                ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{config.label}</div>
                  <div className={`mt-1 text-xs ${mode === currentMode ? 'opacity-90' : 'opacity-70'}`}>
                    {config.description}
                  </div>
                </div>
                {mode === currentMode && (
                  <div className="ml-3">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScaffoldCard>
  );
}
