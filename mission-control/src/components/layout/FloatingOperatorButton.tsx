'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function FloatingOperatorButton() {
  const { isOperator } = useAuth();
  const pathname = usePathname();

  // Don't show on operator pages
  if (!isOperator || pathname.startsWith('/operator')) {
    return null;
  }

  return (
    <Link
      href="/operator"
      className="fixed bottom-6 right-6 z-50 group"
      title="Operator Console"
    >
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-900/30 transition-all duration-200 hover:shadow-xl hover:shadow-orange-900/50 hover:scale-110 active:scale-95">
        {/* Pulse animation ring */}
        <div className="absolute inset-0 rounded-full bg-orange-400 opacity-75 animate-ping" />

        {/* Icon */}
        <svg
          className="relative z-10 h-6 w-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>

        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
          <div className="bg-slate-900 text-slate-100 text-xs font-medium px-3 py-2 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap">
            Operator Console
            <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-slate-900" />
          </div>
        </div>
      </div>
    </Link>
  );
}
