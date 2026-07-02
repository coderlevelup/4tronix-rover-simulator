/**
 * Notification Modal Component
 *
 * Shows notifications for:
 * - Completed missions (green)
 * - New missions to explore (orange)
 *
 * Notifications arrive via props; the Navbar currently passes an empty list
 * until the backend feed is wired up, so learners see the empty state.
 */

'use client';

import { X } from 'lucide-react';

interface CompletedNotification {
  type: 'completed';
  missionName: string;
  completedAt: string; // e.g., "1 day ago", "2 hours ago"
}

interface NewMissionNotification {
  type: 'new-mission';
  missionName: string;
  message: string;
}

type Notification = CompletedNotification | NewMissionNotification;

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: Notification[];
}

export function NotificationModal({
  isOpen,
  onClose,
  notifications = []
}: NotificationModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-20 right-4 z-50 w-[350px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl clay">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold text-foreground">Notifications</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close notifications"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="max-h-[500px] divide-y divide-border overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No new notifications
            </div>
          ) : (
            notifications.map((notification, index) => (
              <div key={index}>
                {notification.type === 'completed' && (
                  <div className="bg-green-600/90 p-4 text-white">
                    <p className="mb-1 text-sm font-semibold">
                      Your mission is complete
                    </p>
                    <p className="text-sm opacity-90">
                      Mission <span className="font-medium">{notification.missionName}</span> was completed {notification.completedAt}
                    </p>
                  </div>
                )}

                {notification.type === 'new-mission' && (
                  <div className="bg-orange-500/90 p-4 text-white">
                    <p className="mb-1 text-sm font-semibold">
                      New Missions to Explore!
                    </p>
                    <p className="text-sm opacity-90">
                      {notification.message}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
