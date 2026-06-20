/**
 * Global Navigation Bar Component
 *
 * Provides consistent navigation across all pages of the Mars Rover Platform
 *
 * Features:
 * - Links to all main pages (Home, Mission, History)
 * - Operator login access
 * - Responsive design
 * - Active route highlighting
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function Navbar() {
  const pathname = usePathname();

  /**
   * Check if a route is currently active
   * Handles exact matches and partial matches for dynamic routes
   */
  const isActive = (path: string): boolean => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  /**
   * Get link styling based on active state
   */
  const getLinkClass = (path: string): string => {
    const baseClass =
      'px-3 py-2 text-sm font-medium transition-colors rounded-md';
    const activeClass = 'bg-orange-600 text-white';
    const inactiveClass = 'text-slate-300 hover:text-white hover:bg-slate-800';

    return `${baseClass} ${isActive(path) ? activeClass : inactiveClass}`;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold text-slate-100">
                Mars Rover Platform
              </span>
            </Link>
          </div>

          {/* Main Navigation Links */}
          <div className="hidden md:block">
            <div className="flex items-center space-x-2">
              <Link href="/" className={getLinkClass('/')}>
                Home
              </Link>
              <Link href="/missions" className={getLinkClass('/missions')}>
                Browse Missions
              </Link>
              <Link href="/challenges" className={getLinkClass('/challenges')}>
                Challenges
              </Link>
              <Link href="/leaderboard" className={getLinkClass('/leaderboard')}>
                Leaderboard
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <div className="flex space-x-2">
            <Link href="/" className={getLinkClass('/')}>
              Home
            </Link>
            <Link href="/missions" className={getLinkClass('/missions')}>
              Browse
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
