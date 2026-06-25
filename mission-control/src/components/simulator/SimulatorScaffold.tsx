'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mission } from '@/core/domain/entities/Mission';
import { SimulatorVisualization } from './SimulatorVisualization';

interface SimulatorScaffoldProps {
  missionId: string;
}

export function SimulatorScaffold({ missionId }: SimulatorScaffoldProps) {
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMission();
  }, [missionId]);

  const fetchMission = async () => {
    try {
      const response = await fetch(`/api/operator/missions/${missionId}`);
      const data = await response.json();

      if (data.success) {
        setMission(data.mission);
      } else {
        setError(data.error || 'Failed to fetch mission');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Fetch mission error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/operator');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500"></div>
            <div className="absolute inset-2 animate-pulse rounded-full bg-orange-500/10"></div>
          </div>
          <p className="text-slate-300 font-medium">Loading mission...</p>
        </div>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-rose-500/5 backdrop-blur-xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-red-400">Error Loading Mission</p>
              <p className="text-sm text-red-300/70 mt-1">{error || 'Mission not found'}</p>
            </div>
          </div>
          <button
            onClick={handleBack}
            className="w-full mt-4 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 shadow-lg transition-all duration-200 hover:bg-slate-700 hover:text-slate-100"
          >
            Back to Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-950/50 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              aria-label="Back to console"
              className="rounded-xl bg-slate-800 p-2 text-slate-300 shadow-lg transition-all duration-200 hover:bg-slate-700 hover:text-slate-100 hover:-translate-x-0.5"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-400">
                Simulator
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                Mission {missionId}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">
              {new Date(mission.submittedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content - Code Display */}
      <div className="flex-none border-b border-slate-800/50 bg-slate-900/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Mission Code
            </h2>
            <span className="text-xs text-slate-500 font-mono">{mission.yardId}</span>
          </div>
          <div className="rounded-xl border border-slate-800/50 bg-slate-950/80 overflow-hidden">
            <pre className="p-4 text-sm text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
              {mission.code}
            </pre>
          </div>
        </div>
      </div>

      {/* Simulator Visualization */}
      <div className="flex-1 flex flex-col min-h-0">
        <SimulatorVisualization mission={mission} />
      </div>
    </div>
  );
}
