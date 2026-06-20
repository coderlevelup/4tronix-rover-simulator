'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { SimulatorTrajectoryPanel } from '@/components/operator/SimulatorTrajectoryPanel';
import type { Mission } from '@/core/domain/entities/Mission';

export default function SimulatorClient({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchMission = async () => {
      try {
        const response = await fetch(`/api/operator/missions/${missionId}`);
        const data = await response.json();
        if (cancelled) return;

        if (data.success && data.mission) {
          setMission(data.mission);
        } else {
          setError(data.error || 'Mission not found');
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load mission');
          console.error('Fetch mission error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchMission();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-primary shadow-glow-mars" />
          </div>
          <p className="font-display text-base font-bold text-foreground">Loading mission...</p>
        </div>
      </main>
    );
  }

  if (error || !mission) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur-xl p-8 shadow-card max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-display text-base font-bold text-destructive">Error Loading Mission</p>
              <p className="font-mono text-sm text-destructive/70 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/operator')}
            className="mt-4 w-full rounded-2xl bg-muted px-4 py-2.5 font-semibold text-sm text-foreground hover:bg-muted/80 transition-colors"
          >
            Back to Operator Console
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="bg-card/40 backdrop-blur-xl border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Simulator</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            {mission.name || 'Untitled Mission'}
          </p>
        </div>
        <button
          onClick={() => router.push('/operator')}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Console
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <SimulatorTrajectoryPanel mission={mission} pollingEnabled={true} />
      </div>
    </main>
  );
}
