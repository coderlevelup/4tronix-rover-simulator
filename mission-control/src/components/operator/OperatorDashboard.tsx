'use client';

import { useEffect, useState } from 'react';
import { YardStatusCard } from './YardStatusCard';
import { YardServerHealth } from './YardServerHealth';
import { MissionQueue } from './MissionQueue';
import { useRoverConfig } from '@/hooks/useRoverConfig';
import { useAuth } from '@/contexts/AuthContext';
import { OPERATOR_ACCESS_HEADER, OPERATOR_ID_HEADER, OPERATOR_YARDS_HEADER } from '@/infrastructure/auth/operator-claims';
import type { YardStatus } from '@/core/domain/entities/Yard';
import { Radio, Clock, Flame, CheckCircle2, Bot, Rocket, ClipboardList } from 'lucide-react';

const statConfig = [
  { key: 'totalMissions',    label: 'Total Missions',   icon: Radio, accent: false },
  { key: 'queuedMissions',   label: 'Awaiting Launch',  icon: Clock, accent: false },
  { key: 'processingMissions', label: 'In Progress',    icon: Flame, accent: 'amber' },
  { key: 'completedToday',   label: 'Done Today',       icon: CheckCircle2, accent: 'green' },
] as const;

export function OperatorDashboard() {
  const { activeConfig, loading: configLoading } = useRoverConfig();
  const { operatorId, operatorRole, operatorYards, loading: authLoading } = useAuth();
  const [yardStatus, setYardStatus] = useState<YardStatus>('offline');
  const [stats, setStats] = useState({
    totalMissions: 0,
    queuedMissions: 0,
    processingMissions: 0,
    completedToday: 0,
  });

  useEffect(() => {
    if (!authLoading) {
      void fetchStats();
    }
  }, [authLoading, operatorId, operatorRole, operatorYards]);

  const makeAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};

    if (operatorId && operatorRole) {
      headers[OPERATOR_ID_HEADER] = operatorId;
      headers[OPERATOR_ACCESS_HEADER] = operatorRole;

      if (operatorYards?.length) {
        headers[OPERATOR_YARDS_HEADER] = operatorYards.join(',');
      }
    }

    return headers;
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/operator/missions', {
        headers: makeAuthHeaders(),
      });

      if (response.redirected && response.url.includes('/login')) {
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        console.error('Unexpected response while fetching stats:', response.status);
        return;
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.missions)) {
        return;
      }

      const missions = data.missions;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setStats({
        totalMissions: missions.length,
        queuedMissions: missions.filter((m: any) => m.status === 'queued').length,
        processingMissions: missions.filter((m: any) => m.status === 'processing').length,
        completedToday: missions.filter((m: any) => {
          if (m.status !== 'completed' || !m.completedAt) return false;
          const d = new Date(m.completedAt); d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        }).length,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statConfig.map(({ key, label, icon: Icon, accent }) => {
          const value = stats[key];
          const valueClass =
            accent === 'amber' ? 'text-[oklch(0.78_0.18_55)]' :
            accent === 'green' ? 'text-[oklch(0.74_0.18_175)]' :
            'text-foreground';

          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-4 shadow-card"
            >
              {/* Subtle cosmic bg */}
              <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className={`font-display text-3xl font-extrabold tabular-nums ${valueClass}`}>{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rover + Yard row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Active Rover */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
          <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-muted-foreground" />
                <p className="font-display text-sm font-bold text-foreground">Active Rover</p>
              </div>
              {!configLoading && (
                <a href="/operator/config" className="font-mono text-[10px] uppercase tracking-widest text-primary hover:text-primary/80 transition-colors">
                  Config →
                </a>
              )}
            </div>

            {configLoading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-border border-t-primary" />
                <span className="font-mono text-xs text-muted-foreground">Connecting...</span>
              </div>
            ) : activeConfig ? (
              <div>
                <p className="font-display text-lg font-bold text-foreground truncate">{activeConfig.name}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate">{activeConfig.ipAddress}:{activeConfig.port}</p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary shadow-glow-mars">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Transmitting
                </div>
              </div>
            ) : (
              <div className="py-1">
                <p className="text-sm text-muted-foreground mb-3">No rover online yet, Cadet.</p>
                <a
                  href="/operator/config"
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-glow-mars hover:-translate-y-0.5 transition-transform"
                >
                  <Rocket className="w-4 h-4" /> Deploy Rover
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Yard Status */}
        <YardStatusCard onStatusChange={setYardStatus} />
      </div>

      {/* Yard server health */}
      <YardServerHealth />

      {/* Mission Queue */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <ClipboardList className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold text-foreground">Mission Queue</h2>
        </div>
        <MissionQueue yardStatus={yardStatus} />
      </div>
    </div>
  );
}