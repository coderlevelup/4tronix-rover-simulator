/**
 * Global Navigation Bar
 *
 * Desktop (md+): top bar with explicit Home and My History links,
 * a prominent "Create Mission" button, and the notification bell.
 * Mobile (< md): top bar shows logo + bell; the destinations move to a fixed
 * bottom tab bar (kid-friendly, always visible, no hidden hamburger menu).
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Home,
  Clock,
  Plus,
  Mail,
} from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { NotificationModal } from './NotificationModal';
import { useLearner } from '@/contexts/LearnerContext';
import { EmailPrompt } from '@/components/learner/EmailPrompt';

const NAV_ITEMS = [
  { href: '/', label: 'Home', mobileLabel: 'Home', icon: Home },
  {
    href: '/history',
    label: 'My History',
    mobileLabel: 'History',
    icon: Clock,
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { openEmailPrompt } = useLearner();

  // Real notifications will be wired to the backend later — no placeholder data.
  const sampleNotifications: ComponentProps<typeof NotificationModal>['notifications'] = [];

  const isActive = (path: string): boolean => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(path + '/');
  };

  const desktopLinkClass = (path: string): string => {
    const base =
      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg';
    const active = 'bg-gradient-mars text-primary-foreground shadow-glow-mars';
    const inactive =
      'text-muted-foreground hover:text-foreground hover:bg-card/50';

    return `${base} ${isActive(path) ? active : inactive}`;
  };

  const hasUnread = sampleNotifications.length > 0;

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2.5">
          <div className="flex items-center justify-between">
            {/* Logo / Brand (also links home) */}
            <Link href="/" className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-lg shadow-lg">
                <Image
                  src="/rover-hero.jpg"
                  alt="Mars Rover"
                  width={256}
                  height={256}
                  className="h-full w-full object-cover object-center"
                  quality={100}
                  priority
                />
              </div>
              <div className="leading-tight">
                <p className="font-display text-lg font-bold text-foreground">
                  Rover Cadets
                </p>
                <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  Sapient.rocks
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {/* Desktop destinations */}
              <div className="hidden items-center gap-2 md:flex">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={desktopLinkClass(href)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}

                {/* Prominent primary action */}
                <Link
                  href="/mission"
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-900/20 transition-all hover:-translate-y-0.5 hover:shadow-orange-900/30"
                >
                  <Plus className="h-4 w-4" />
                  Create Mission
                </Link>
              </div>

              {/* Edit email (always visible) */}
              <button
                onClick={openEmailPrompt}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card/50 hover:text-foreground"
                aria-label="Edit email"
                title="Edit email"
              >
                <Mail className="h-5 w-5" />
              </button>

              {/* Notification bell (always visible) */}
              <button
                onClick={() => setIsNotificationOpen(true)}
                className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card/50 hover:text-foreground"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {hasUnread && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/80 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          <Link
            href="/"
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
              isActive('/') ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Home className="h-5 w-5" />
            Home
          </Link>

          <Link
            href="/mission"
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-white"
            aria-label="Create Mission"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 shadow-lg shadow-orange-900/30">
              <Plus className="h-5 w-5" />
            </span>
          </Link>

          <Link
            href="/history"
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
              isActive('/history')
                ? 'text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            <Clock className="h-5 w-5" />
            History
          </Link>

          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-muted-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            Alerts
            {hasUnread && (
              <span className="absolute right-1.5 top-0 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        </div>
      </nav>

      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={sampleNotifications}
      />

      <EmailPrompt />
    </>
  );
}