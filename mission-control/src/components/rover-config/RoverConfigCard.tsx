import { useState } from "react";
import { RoverTypeBadge } from "@/lib/rover-type-utils";
import type { RoverType } from "@/core/domain/entities/RoverConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoverStatus = "online" | "offline" | "unknown";

export interface RoverConfig {
  id: string;
  name: string;
  tag: string;
  roverType?: RoverType;  // Optional for backward compatibility
  ipAddress: string;
  port: number;
  /** Drives the green/amber active highlight */
  active: boolean;
  /** Drives the status badge colour */
  status?: RoverStatus;
  /** ISO date string */
  updatedAt?: string;
}

export interface RoverConfigListItem extends RoverConfig {}

export interface RoverConfigCardProps {
  config: RoverConfig;
  onEdit: (config: RoverConfig) => void;
  onDelete: (id: string) => Promise<void> | void;
  onSetActive: (id: string) => Promise<void> | void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function deriveStatus(config: RoverConfig): RoverStatus {
  if (config.status) return config.status;
  return config.active ? "online" : "offline";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
      <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
      <path d="M2 4h12M5 4V2.5h6V4M6 7v5M10 7v5M3 4l1 9h8l1-9" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14" />
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<RoverStatus, { dot: string; pill: string; label: string }> = {
  online: {
    dot:   "bg-[oklch(0.74_0.18_175)] shadow-[0_0_5px_1px_rgba(52,211,153,0.5)]",
    pill:  "bg-[oklch(0.74_0.18_175)]/15 border-[oklch(0.74_0.18_175)]/30 text-[oklch(0.74_0.18_175)]",
    label: "Online",
  },
  offline: {
    dot:   "bg-destructive shadow-[0_0_5px_1px_rgba(239,68,68,0.35)]",
    pill:  "bg-destructive/15 border-destructive/30 text-destructive",
    label: "Offline",
  },
  unknown: {
    dot:   "bg-muted-foreground/60",
    pill:  "bg-muted/60 border-border text-muted-foreground",
    label: "Unknown",
  },
};

function StatusBadge({ status }: { status: RoverStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
      text-[10px] font-bold tracking-widest uppercase border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Data row ─────────────────────────────────────────────────────────────────

function DataRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-muted-foreground flex-shrink-0 select-none">
        {label}
      </dt>
      <dd className={`${mono ? "font-mono" : ""} text-xs text-foreground text-right truncate max-w-[160px]`}>
        {value}
      </dd>
    </>
  );
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

interface DeleteModalProps {
  config: RoverConfig;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function DeleteModal({ config, onConfirm, onCancel }: DeleteModalProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
      bg-black/70 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className="w-full max-w-sm bg-card border border-destructive/30 rounded-2xl
        shadow-card overflow-hidden">

        <div className="flex items-center gap-3 px-5 py-3 bg-muted/40 border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive shadow-[0_0_6px_2px_rgba(239,68,68,0.3)]" />
          <p id="del-title" className="font-mono text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Confirm Deletion
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-sm text-foreground leading-relaxed">
            Remove{" "}
            <span className="font-mono text-destructive font-semibold">{config.name}</span>
            {" "}from the fleet? This action cannot be undone.
          </p>

          <div className="bg-muted/50 border border-border rounded-xl px-3.5 py-2.5
            font-mono text-xs text-muted-foreground space-y-1">
            <div><span className="text-muted-foreground/70">TAG </span>{config.tag}</div>
            <div><span className="text-muted-foreground/70">NET </span>{config.ipAddress}:{config.port}</div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button onClick={onCancel} disabled={busy}
              className="flex-1 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground
                hover:text-foreground hover:border-primary/40 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl
                bg-destructive hover:bg-destructive/90 active:bg-destructive text-destructive-foreground text-sm font-semibold
                tracking-wide transition-colors shadow-[0_0_16px_2px_rgba(239,68,68,0.2)]
                disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? <><Spinner />Deleting…</> : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function RoverConfigCard({
  config,
  onEdit,
  onDelete,
  onSetActive,
}: RoverConfigCardProps) {
  const [settingActive, setSettingActive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = deriveStatus(config);

  const handleSetActive = async () => {
    if (config.active) return;
    setSettingActive(true);
    try { await onSetActive(config.id); } finally { setSettingActive(false); }
  };

  return (
    <>
      {confirmDelete && (
        <DeleteModal
          config={config}
          onConfirm={async () => { await onDelete(config.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <article
        aria-label={`Rover: ${config.name}`}
        className={`
          relative flex flex-col rounded-2xl overflow-hidden
          border transition-all duration-200
          bg-card/60 backdrop-blur
          ${config.active
            ? "border-primary/40 shadow-glow-mars"
            : "border-border hover:border-primary/40"
          }
        `}
      >
        <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
        {/* ── Active accent bar ── */}
        {config.active && (
          <div className="absolute inset-y-0 left-0 w-0.5 bg-primary
            shadow-glow-mars" />
        )}

        {/* ── Card header ── */}
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b
          ${config.active
            ? "bg-primary/5 border-primary/20"
            : "bg-muted/40 border-border"
          }`}>
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className={`w-2 h-2 rounded-full ${config.active ? "bg-primary" : "bg-muted-foreground/40"}`} />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase flex-1 truncate">
            {config.tag}
          </span>
          {config.active && (
            <span className="text-[9px] font-bold tracking-widest uppercase
              text-primary bg-primary/10 border border-primary/20
              px-1.5 py-0.5 rounded-full flex-shrink-0">
              Active
            </span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 px-4 pt-4 pb-3 flex flex-col gap-4">

          {/* Name + type + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-bold leading-tight truncate mb-1.5
                ${config.active ? "text-primary" : "text-foreground"}`}>
                {config.name}
              </h3>
              {config.roverType && <RoverTypeBadge type={config.roverType} size="sm" />}
            </div>
            <StatusBadge status={status} />
          </div>

          {/* Data fields */}
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-dashed border-border pt-3">
            <DataRow label="IP"      value={config.ipAddress} />
            <DataRow label="Port"    value={config.port} />
            <DataRow label="Updated" value={fmtDate(config.updatedAt)} mono={false} />
          </dl>
        </div>

        {/* ── Action bar ── */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-t border-border bg-muted/20">

          {/* Set Active */}
          <button
            onClick={handleSetActive}
            disabled={config.active || settingActive}
            aria-label={config.active ? "Already active" : `Set ${config.name} as active`}
            title={config.active ? "Currently active" : "Set as active rover"}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
              border transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary
              ${config.active
                ? "border-primary/30 text-primary/60 cursor-default opacity-60"
                : settingActive
                ? "border-border text-muted-foreground cursor-wait"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5"
              }
            `}
          >
            {settingActive ? <Spinner /> : <IconTarget />}
            <span>{config.active ? "Active" : "Set Active"}</span>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Edit */}
          <button
            onClick={() => onEdit(config)}
            aria-label={`Edit ${config.name}`}
            className="
              flex items-center gap-1.5 px-2.5 py-1.5 rounded
              border border-border text-muted-foreground text-xs font-medium
              hover:border-primary/60 hover:text-primary hover:bg-primary/5
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary
            "
          >
            <IconEdit />
            Edit
          </button>

          {/* Delete */}
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${config.name}`}
            className="
              flex items-center gap-1.5 px-2.5 py-1.5 rounded
              border border-border text-muted-foreground text-xs font-medium
              hover:border-destructive/60 hover:text-destructive hover:bg-destructive/5
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive
            "
          >
            <IconDelete />
            Delete
          </button>
        </div>
      </article>
    </>
  );
}