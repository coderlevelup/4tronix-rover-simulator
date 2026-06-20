'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function PageTransition({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition-enter">
      {children}
    </div>
  );
}