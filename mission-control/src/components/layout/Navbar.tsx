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
} from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { NotificationModal } from './NotificationModal';
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

  // Real notifications will be wired to the backend later - no placeholder data.
  const sampleNotifications: ComponentProps<typeof NotificationModal>['notifications'] = [];

  const isActive = (path: string): boolean => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(path + '/');
  };

  // Each destination is a segment inside a single pill-shaped nav group.
  const desktopLinkClass = (path: string): string => {
    const base =
      'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors';
    const active = 'bg-gradient-mars text-primary-foreground clay';
    const inactive =
      'text-muted-foreground hover:text-foreground hover:bg-card/60';

    return `${base} ${isActive(path) ? active : inactive}`;
  };

  const hasUnread = sampleNotifications.length > 0;

  return (
    <>
      {/* Divider is an inset shadow (not border-b) so the bar stays exactly 64px
          tall, matching the h-[calc(100vh-64px)] page mains (no 1px overflow). */}
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_-1px_0_0_var(--border)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          {/* Logo / Brand (also links home) */}
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 clay transition-transform duration-200 group-hover:-translate-y-0.5">
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
              <p className="font-display text-lg font-bold tracking-tight text-foreground">
                Mission Control
              </p>
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-primary" />
                Sapient.rocks
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {/* Desktop destinations - one segmented pill group */}
            <div className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1 md:flex">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={desktopLinkClass(href)}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}

            </div>

            {/* Prominent primary action */}
            <Link
              href="/mission"
              className="clay clay-press hidden items-center gap-1.5 rounded-full bg-gradient-mars px-4 py-2 text-sm font-bold text-primary-foreground md:flex"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Create Mission
            </Link>

            {/* Notification bell (desktop; mobile uses the bottom "Alerts" tab) */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative hidden rounded-full border border-border/60 bg-card/40 p-2.5 text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground md:block"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {hasUnread && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          <Link
            href="/"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition-colors ${
              isActive('/') ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Home className="h-5 w-5" />
            Home
          </Link>

          <Link
            href="/mission"
            className="flex flex-col items-center text-[10px] font-bold text-white"
            aria-label="Create Mission"
          >
            <span className="clay clay-press flex h-12 w-12 -translate-y-2 items-center justify-center rounded-2xl bg-gradient-mars ring-4 ring-background">
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </span>
          </Link>

          <Link
            href="/history"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition-colors ${
              isActive('/history') ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Clock className="h-5 w-5" />
            History
          </Link>

          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            Alerts
            {hasUnread && (
              <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
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