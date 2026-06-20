'use client';

import { useState } from 'react';
import { useRoverConfig } from '@/hooks/useRoverConfig';
import RoverConfigForm, { type RoverConfig as RoverFormData } from '@/components/rover-config/RoverConfigForm';
import RoverConfigList, { type RoverConfig as RoverListItem } from '@/components/rover-config/RoverConfigList';
import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { X } from 'lucide-react';

// ─── Type definitions ──────────────────────────────────────────────────────

type PanelMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; rover: RoverListItem };

// ─── Mapping functions ────────────────────────────────────────────────────

function toRoverListItem(config: RoverConfig): RoverListItem & { roverType: 'physical' | 'simulator' } {
  return {
    id: config.id,
    name: config.name,
    tag: config.roverTag,
    roverType: config.roverType,
    ipAddress: config.ipAddress,
    port: config.port,
    active: config.isActive,
    status: config.isActive ? 'online' : 'offline',
    updatedAt: config.updatedAt,
  };
}

function toFormInitial(rover: RoverListItem & { roverType?: 'physical' | 'simulator' }): Partial<RoverFormData> {
  return {
    name: rover.name,
    tag: rover.tag,
    roverType: rover.roverType || 'physical',
    ipAddress: rover.ipAddress,
    port: rover.port,
  };
}

// ─── Slide panel component ────────────────────────────────────────────────

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`
          fixed inset-0 z-30 bg-black/70 backdrop-blur-sm
          transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          fixed inset-y-0 right-0 z-40 w-full max-w-lg
          flex flex-col
          bg-card/95 backdrop-blur-xl border-l border-border
          shadow-card
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="flex items-center gap-3 px-6 py-4 bg-muted/40 border-b border-border flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-glow-mars" />
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex-1">
            {title}
          </p>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function RoverConfigModule() {
  const { configs, activeConfig, loading, createConfig, setActive, updateConfig, deleteConfig } =
    useRoverConfig();

  const [panel, setPanel] = useState<PanelMode>({ type: 'closed' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rovers: RoverListItem[] = configs.map(toRoverListItem);
  const activeRoverId = activeConfig?.id ?? null;
  const isPanelOpen = panel.type !== 'closed';

  // ── Event handlers ──────────────────────────────────────────────────────

  const handleAdd = () => setPanel({ type: 'create' });

  const handleEdit = (rover: RoverListItem) => {
    setPanel({ type: 'edit', rover });
  };

  const closePanel = () => setPanel({ type: 'closed' });

  const handleCreate = async (data: RoverFormData) => {
    setIsSubmitting(true);
    try {
      await createConfig({
        name: data.name,
        roverTag: data.tag,
        roverType: data.roverType,
        ipAddress: data.ipAddress,
        port: data.port,
        visualFeedType: data.roverType === 'simulator' ? 'simulator' : 'camera',
      });
      closePanel();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (data: RoverFormData) => {
    if (panel.type !== 'edit') return;

    setIsSubmitting(true);
    try {
      await updateConfig(panel.rover.id, {
        name: data.name,
        roverTag: data.tag,
        roverType: data.roverType,
        ipAddress: data.ipAddress,
        port: data.port,
      });
      closePanel();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteConfig(id);
  };

  const handleSetActive = async (id: string) => {
    await setActive(id);
  };

  return (
    <>
      <SlidePanel
        open={isPanelOpen}
        onClose={closePanel}
        title={panel.type === 'edit' ? 'Edit Rover' : 'New Rover'}
      >
        {panel.type === 'create' && (
          <RoverConfigForm
            onSubmit={handleCreate}
            onCancel={closePanel}
            submitLabel="Deploy Rover"
          />
        )}

        {panel.type === 'edit' && (
          <RoverConfigForm
            key={panel.rover.id}
            initialValues={toFormInitial(panel.rover)}
            onSubmit={handleUpdate}
            onCancel={closePanel}
            submitLabel="Save Changes"
          />
        )}
      </SlidePanel>

      <RoverConfigList
        rovers={rovers}
        loading={loading}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSetActive={handleSetActive}
      />
    </>
  );
}
