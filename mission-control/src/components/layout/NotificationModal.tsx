/**
 * Notification Modal Component
 *
 * Shows notifications for:
 * - Completed missions (green background)
 * - New missions to explore (orange background)
 * - Email subscription input
 */

'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

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
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  if (!isOpen) return null;

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // TODO: Save email to backend/database
      console.log('Email subscribed:', email);
      setIsSubscribed(true);
      setTimeout(() => setIsSubscribed(false), 3000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-20 right-4 z-50 w-[350px] bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close notifications"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[500px] overflow-y-auto">
          {/* Email Subscription */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Subscribe to Notifications
              </button>
              {isSubscribed && (
                <p className="mt-2 text-xs text-green-600 text-center">
                  ✓ Subscribed successfully!
                </p>
              )}
            </form>
          </div>

          {/* Notifications List */}
          <div className="divide-y divide-gray-200">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No new notifications
              </div>
            ) : (
              notifications.map((notification, index) => (
                <div key={index}>
                  {notification.type === 'completed' && (
                    <div className="p-4 bg-green-500 text-white">
                      <p className="font-semibold text-sm mb-1">
                        Your mission is complete
                      </p>
                      <p className="text-sm opacity-90">
                        Mission <span className="font-medium">{notification.missionName}</span> was completed {notification.completedAt}
                      </p>
                    </div>
                  )}

                  {notification.type === 'new-mission' && (
                    <div className="p-4 bg-orange-400 text-white">
                      <p className="font-semibold text-sm mb-1">
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
      </div>
    </>
  );
}
