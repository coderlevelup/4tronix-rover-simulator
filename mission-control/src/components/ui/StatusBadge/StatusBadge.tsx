import React from 'react';
import { CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';

export type MissionStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

const STATUS_META: Record<MissionStatus, { label: string; classes: string; Icon: any }> = {
  queued: { label: 'Queued', classes: 'bg-yellow-600 text-black', Icon: Clock },
  processing: { label: 'Running', classes: 'bg-blue-600 text-white', Icon: Clock },
  completed: { label: 'Completed', classes: 'bg-green-600 text-white', Icon: CheckCircle },
  failed: { label: 'Failed', classes: 'bg-red-600 text-white', Icon: XCircle },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-600 text-white', Icon: AlertTriangle },
};

interface Props {
  status: MissionStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: Props) {
  const meta = STATUS_META[status] ?? STATUS_META.queued;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Mission status: ${meta.label}`}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold tracking-wide ${meta.classes} ${className}`}
    >
      <meta.Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">Status:</span>
      <span aria-hidden>{meta.label}</span>
    </span>
  );
}

export default StatusBadge;
