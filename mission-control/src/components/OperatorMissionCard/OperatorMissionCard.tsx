"use client";

import React, { useEffect, useState } from 'react';
import { MoreVertical, Play, Eye } from 'lucide-react';
import { Mission } from '@/core/domain/entities/Mission';
import StatusBadge, { MissionStatus } from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog/ConfirmationDialog';
import ValidatedInput, { isYouTubeUrl } from '@/components/ui/ValidatedInput/ValidatedInput';

interface Props {
  mission: Mission;
  showLearnerId?: boolean;
  onStart?: (id: string) => Promise<void> | void;
  onMarkComplete?: (id: string) => Promise<void> | void;
  onAddVideo?: (id: string, url: string) => Promise<void> | void;
}

export function OperatorMissionCard({ mission, showLearnerId = true, onStart, onMarkComplete, onAddVideo }: Props) {
  const [status, setStatus] = useState<MissionStatus>(mapStatus(mission.status));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'complete' | 'fail' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoSubmitting, setVideoSubmitting] = useState(false);

  useEffect(() => {
    setStatus(mapStatus(mission.status));
  }, [mission.status]);

  async function handleConfirm() {
    if (!confirmAction) return setConfirmOpen(false);
    setConfirmOpen(false);
    try {
      if (confirmAction === 'start') {
        await onStart?.(mission.id);
        setStatus('processing');
      } else if (confirmAction === 'complete') {
        await onMarkComplete?.(mission.id);
        setStatus('completed');
      }
    } catch (err) {
      // show minimal failure feedback; parent should surface richer errors
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  async function submitVideo() {
    setVideoSubmitting(true);
    try {
      if (!isYouTubeUrl(videoUrl)) return;
      await onAddVideo?.(mission.id, videoUrl);
      setVideoUrl('');
      setAddVideoOpen(false);
    } finally {
      setVideoSubmitting(false);
    }
  }

  const primary = status === 'queued' ? { label: 'Start Mission', icon: Play } : { label: 'View Details', icon: Eye };

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <StatusBadge status={status} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{mission.name ?? `Mission-${mission.id.slice(0, 8)}`}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-mono">{mission.yardId}</span>
              <span aria-hidden> · </span>
              <span>{new Date(mission.submittedAt).toLocaleString()}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="More actions"
            onClick={() => setMenuOpen((s) => !s)}
            className="rounded-md p-2 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              if (status === 'queued') {
                setConfirmAction('start');
                setConfirmOpen(true);
              } else {
                // view details: navigate or call parent (left minimal)
                window.location.href = `/missions/${mission.id}`;
              }
            }}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <primary.icon className="h-4 w-4" aria-hidden />
            <span>{primary.label}</span>
          </button>

          <div className="hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setConfirmAction('complete');
                setConfirmOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              Mark Complete
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showLearnerId && <span className="font-mono text-xs text-muted-foreground">{mission.learnerId}</span>}
        </div>
      </div>

      {/* Overflow menu */}
      {menuOpen && (
        <div role="menu" className="absolute right-3 top-12 z-20 w-44 rounded-md border bg-white p-2 shadow-md">
          <button
            role="menuitem"
            onClick={() => {
              setAddVideoOpen((s) => !s);
              setMenuOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted/20"
          >
            Add video
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setConfirmAction('fail');
              setConfirmOpen(true);
              setMenuOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted/20"
          >
            Mark Failed
          </button>
        </div>
      )}

      {/* Add video inline form */}
      {addVideoOpen && (
        <div className="mt-4 w-full sm:max-w-md">
          <ValidatedInput
            id={`youtube-${mission.id}`}
            label="YouTube URL"
            value={videoUrl}
            onChange={setVideoUrl}
            placeholder="https://youtube.com/watch?v=..."
            required
            validator={(v) => (!isYouTubeUrl(v) ? 'Enter a valid YouTube URL (youtube.com or youtu.be).' : null)}
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={submitVideo}
              disabled={!isYouTubeUrl(videoUrl) || videoSubmitting}
              className="min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Attach Video
            </button>
            <button
              onClick={() => setAddVideoOpen(false)}
              className="min-h-[44px] rounded-md border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={confirmOpen}
        title={confirmAction === 'start' ? 'Start this mission?' : confirmAction === 'complete' ? 'Mark this mission as completed?' : 'Mark this mission as failed?'}
        message={confirmAction === 'start' ? 'This will begin execution. This action cannot be undone.' : 'This action cannot be undone.'}
        confirmLabel={confirmAction === 'start' ? 'Start mission' : confirmAction === 'complete' ? 'Mark Complete' : 'Mark Failed'}
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (confirmAction === 'fail') {
            // minimal local change: set status to failed; parent may handle persisted state
            setStatus('failed');
            setConfirmOpen(false);
            return;
          }
          await handleConfirm();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  );
}

function mapStatus(raw: string | undefined): MissionStatus {
  switch (raw) {
    case 'queued':
    case 'processing':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return raw as MissionStatus;
    default:
      return 'queued';
  }
}

export default OperatorMissionCard;
