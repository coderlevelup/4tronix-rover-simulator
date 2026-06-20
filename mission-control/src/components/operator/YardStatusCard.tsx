'use client';

import { useEffect, useState } from 'react';
import type { Yard } from '@/core/domain/entities/Yard';
import { WifiOff, Wifi, Users } from 'lucide-react';

interface YardStatusCardProps {
  onStatusChange?: (status: Yard['status']) => void;
}

export function YardStatusCard({ onStatusChange }: YardStatusCardProps) {
  const [yard, setYard] = useState<Yard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);

  useEffect(() => {
    fetchYardStatus();
  }, []);

  const fetchYardStatus = async () => {
    try {
      const response = await fetch('/api/operator/yard/yard-1/status');
      const data = await response.json();

      if (data.success && data.yard) {
        setYard(data.yard);
        if (onStatusChange) onStatusChange(data.yard.status);
      } else {
        setError(data.error || 'Failed to fetch yard status');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Fetch yard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (newStatus: Yard['status']) => {
    if (!yard || newStatus === yard.status) return;

    setIsTogglingMaintenance(true);
    try {
      const response = await fetch(`/api/operator/yard/${yard.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setYard({ ...yard, status: newStatus });
        if (onStatusChange) onStatusChange(newStatus);
        window.dispatchEvent(new CustomEvent('yardStatusChanged', { detail: newStatus }));
      } else {
        setError(data.error || 'Failed to update yard status');
      }
    } catch (err) {
      setError('Failed to update yard mode');
      console.error('Toggle mode error:', err);
    } finally {
      setIsTogglingMaintenance(false);
    }
  };

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
        <div className="relative flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-border border-t-primary"></div>
        </div>
      </div>
    );
  }

  if (error || !yard) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur p-5 shadow-card">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
        <p className="relative text-xs text-destructive text-center font-semibold">Error loading yard</p>
      </div>
    );
  }

  const statusConfig = {
    offline: {
      label: 'Offline',
      icon: WifiOff,
      textColor: 'text-muted-foreground',
      activeClass: 'bg-muted text-muted-foreground',
      inactiveClass: 'bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted',
    },
    remote: {
      label: 'Remote',
      icon: Wifi,
      textColor: 'text-[oklch(0.68_0.19_252)]',
      activeClass: 'bg-[oklch(0.68_0.19_252)]/15 text-[oklch(0.68_0.19_252)] border-[oklch(0.68_0.19_252)]/30',
      inactiveClass: 'bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted',
    },
    'on-site': {
      label: 'On-Site',
      icon: Users,
      textColor: 'text-[oklch(0.74_0.18_175)]',
      activeClass: 'bg-[oklch(0.74_0.18_175)]/15 text-[oklch(0.74_0.18_175)] border-[oklch(0.74_0.18_175)]/30',
      inactiveClass: 'bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted',
    },
  };

  const currentConfig = statusConfig[yard.status];
  const Icon = currentConfig.icon;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
      <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <p className="font-display text-sm font-bold text-foreground">Yard Mode</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${currentConfig.textColor}`}>
            <Icon className="w-3.5 h-3.5" />
            {currentConfig.label}
          </span>
        </div>

        <div className="flex gap-2">
          {(Object.entries(statusConfig) as Array<[Yard['status'], typeof statusConfig[Yard['status']]]>)
            .map(([mode, modeConfig]) => {
              const ModeIcon = modeConfig.icon;
              const isActive = mode === yard.status;
              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={isTogglingMaintenance || isActive}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-display text-xs font-bold transition-all border ${
                    isActive
                      ? `${modeConfig.activeClass} border-current`
                      : `${modeConfig.inactiveClass} border-border`
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <ModeIcon className="w-3.5 h-3.5" />
                  {isTogglingMaintenance ? '...' : modeConfig.label}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
