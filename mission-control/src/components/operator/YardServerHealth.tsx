'use client';

import { useEffect, useState } from 'react';
import { Server, ServerOff } from 'lucide-react';

interface HealthState {
  reachable: boolean;
  driver?: string;
  queueSize?: number;
}

export function YardServerHealth() {
  const [health, setHealth] = useState<HealthState | null>(null);

  const ping = async () => {
    try {
      const res = await fetch('/api/operator/yard/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ reachable: false });
    }
  };

  useEffect(() => {
    void ping();
    const interval = setInterval(() => { void ping(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
      <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          {health.reachable
            ? <Server className="w-4 h-4 text-[oklch(0.74_0.18_175)]" />
            : <ServerOff className="w-4 h-4 text-muted-foreground" />
          }
          <p className="font-display text-sm font-bold text-foreground">Yard Server</p>
        </div>

        {health.reachable ? (
          <div className="flex items-center gap-3">
            {health.driver && (
              <span className="font-mono text-[10px] text-muted-foreground">{health.driver}</span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.74_0.18_175)]/30 bg-[oklch(0.74_0.18_175)]/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[oklch(0.74_0.18_175)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.74_0.18_175)] animate-pulse" />
              Connected · {health.queueSize ?? 0} queued
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Unreachable
          </span>
        )}
      </div>
    </div>
  );
}
