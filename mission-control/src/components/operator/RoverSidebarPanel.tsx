'use client';

import ActiveRoverSelector, { type RoverOption } from '@/components/rover-config/ActiveRoverSelector';
import { RoverConfig } from '@/core/domain/entities/RoverConfig';

export interface RoverSidebarPanelProps {
  rovers: RoverConfig[];
  activeConfig: RoverConfig | null;
  onChangeActive: (id: string | null) => void;
  loading?: boolean;
}

export function RoverSidebarPanel({
  rovers,
  activeConfig,
  onChangeActive,
  loading = false,
}: RoverSidebarPanelProps) {
  const roverOptions: RoverOption[] = rovers.map((r) => ({
    id: r.id,
    name: r.name,
    tag: r.roverTag,
    ipAddress: r.ipAddress,
    port: r.port,
    active: r.isActive,
  }));

  const activeRoverId = activeConfig?.id ?? null;

  return (
    <div className="space-y-4">
      <ActiveRoverSelector
        rovers={roverOptions}
        value={activeRoverId}
        onChange={onChangeActive}
        loading={loading}
      />

      {activeConfig && (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
          <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
          <div className="relative">
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Connection Details
          </p>

          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-border">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                activeConfig.isActive ? 'text-[oklch(0.74_0.18_175)]' : 'text-muted-foreground'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  activeConfig.isActive ? 'bg-[oklch(0.74_0.18_175)]' : 'bg-muted-foreground/50'
                }`} />
                {activeConfig.isActive ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">IP Address</span>
              <span className="text-xs font-mono text-foreground text-right truncate max-w-[140px]">
                {activeConfig.ipAddress}
              </span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">Port</span>
              <span className="text-xs font-mono text-foreground">
                {activeConfig.port}
              </span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">Tag</span>
              <span className="text-xs font-mono text-foreground truncate max-w-[140px]">
                {activeConfig.roverTag}
              </span>
            </div>

            {activeConfig.lastConnectedAt && (
              <div className="flex items-start justify-between gap-2 pt-2.5 border-t border-border">
                <span className="text-xs text-muted-foreground">Last Connected</span>
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('en-GB', {
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(activeConfig.lastConnectedAt))}
                </span>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {!activeConfig && rovers.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-card">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select a rover from the dropdown to view connection details.
          </p>
        </div>
      )}
    </div>
  );
}
