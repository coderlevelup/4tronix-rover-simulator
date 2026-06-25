import { MissionStatus } from '@/core/domain/entities/Mission';

/**
 * Discovery status: the simplified, learner-facing view of a mission's lifecycle
 * used by the public feed and the mission detail page.
 *
 * Intentionally only Completed or Pending: a learner should not be made to feel
 * bad by seeing their own mission marked "Failed", so anything not completed
 * (queued / processing / failed / cancelled) reads as "Pending". The operator
 * console shows the full, accurate status instead.
 */
export type DiscoveryStatus = 'Completed' | 'Pending';

export function getDiscoveryStatus(status: MissionStatus): DiscoveryStatus {
  return status === 'completed' ? 'Completed' : 'Pending';
}

/** Solid pill badge (on thumbnails and next to titles). */
export const DISCOVERY_BADGE_CLASS: Record<DiscoveryStatus, string> = {
  Completed: 'bg-emerald-500/85 text-emerald-950',
  Pending: 'bg-amber-300/85 text-amber-950',
};

/** Inline status text (e.g. the Status field on the detail page). */
export const DISCOVERY_TEXT_CLASS: Record<DiscoveryStatus, string> = {
  Completed: 'text-green-400',
  Pending: 'text-amber-300',
};
