import RoverConfigCard, { type RoverConfig, type RoverConfigListItem } from "./RoverConfigCard";
import { Plus, Bot } from 'lucide-react';

export type { RoverConfig, RoverConfigListItem };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RoverConfigListProps {
  rovers: RoverConfigListItem[];
  loading?: boolean;
  /** Called when the user confirms deletion */
  onDelete: (id: string) => Promise<void> | void;
  /** Called when the user clicks edit */
  onEdit: (rover: RoverConfigListItem) => void;
  /** Called when the user clicks "Set Active" */
  onSetActive: (id: string) => Promise<void> | void;
  /** Called when the user clicks "+ Add Rover" */
  onAdd?: () => void;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur">
      <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-2 h-2 rounded-full bg-border animate-pulse" />
            ))}
          </div>
          <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
        </div>
        <div className="px-5 pt-4 pb-3 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="flex flex-col gap-2.5 border-t border-dashed border-border pt-3">
            <div className="flex justify-between">
              <div className="h-2 w-6 rounded bg-muted animate-pulse" />
              <div className="h-2 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="flex justify-between">
              <div className="h-2 w-6 rounded bg-muted animate-pulse" />
              <div className="h-2 w-16 rounded bg-muted animate-pulse" />
            </div>
            <div className="flex justify-between">
              <div className="h-2 w-6 rounded bg-muted animate-pulse" />
              <div className="h-2 w-20 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-border">
          <div className="h-7 w-20 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1" />
          <div className="h-7 w-14 rounded-xl bg-muted animate-pulse" />
          <div className="h-7 w-16 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}


// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 gap-5">
      <Bot className="w-16 h-16 text-muted-foreground opacity-20" />
      <div className="text-center space-y-2">
        <p className="font-display text-base font-bold text-foreground">No rovers deployed</p>
        <p className="font-mono text-xs text-muted-foreground max-w-xs leading-relaxed">
          Your fleet is empty. Add a rover configuration to begin mission operations.
        </p>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-glow-mars hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus className="w-4 h-4" />
          Add First Rover
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoverConfigList({
  rovers,
  loading = false,
  onDelete,
  onEdit,
  onSetActive,
  onAdd,
}: RoverConfigListProps) {
  const onlineCount = rovers.filter((r) => r.active).length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Panel header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse
            shadow-glow-mars flex-shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-bold tracking-wider uppercase text-foreground">
              Rover Fleet
            </h2>
            {!loading && (
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                {rovers.length} unit{rovers.length !== 1 ? "s" : ""} ·{" "}
                <span className="text-[oklch(0.74_0.18_175)]">{onlineCount} online</span>
              </p>
            )}
            {loading && (
              <div className="h-4 w-32 rounded bg-muted animate-pulse mt-0.5" />
            )}
          </div>
        </div>

        {onAdd && (
          <button
            onClick={onAdd}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-4 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-glow-mars hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="w-4 h-4" />
            Add Rover
          </button>
        )}
      </div>

      {/* ── Card container ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur shadow-card">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />

        {/* Top bar */}
        <div className="relative flex items-center gap-2 px-5 py-3 bg-muted/40 border-b border-border">
          <div className="flex gap-1.5">
            {["bg-muted-foreground/40", "bg-muted-foreground/40", "bg-primary"].map((c, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${c}`} aria-hidden="true" />
            ))}
          </div>
          <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase ml-1">
            rover-config-list
          </span>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="relative p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: Math.max(3, rovers.length) }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Card grid */}
        {!loading && rovers.length > 0 && (
          <div className="relative p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rovers.map((rover) => (
              <RoverConfigCard
                key={rover.id}
                config={rover}
                onEdit={onEdit}
                onDelete={onDelete}
                onSetActive={onSetActive}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && rovers.length === 0 && <div className="relative"><EmptyState onAdd={onAdd} /></div>}

        {/* Footer */}
        {!loading && rovers.length > 0 && (
          <div className="relative px-5 py-3 bg-muted/20 border-t border-border
            flex items-center justify-between">
            <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
              {rovers.length} record{rovers.length !== 1 ? "s" : ""}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/60">rover-cfg v1</span>
          </div>
        )}
      </div>
    </div>
  );
}