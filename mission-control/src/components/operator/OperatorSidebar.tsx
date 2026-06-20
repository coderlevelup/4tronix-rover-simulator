'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Settings, LogOut, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OperatorSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/operator',
      icon: LayoutDashboard,
    },
    {
      name: 'Rover Config',
      href: '/operator/config',
      icon: Settings,
    },
  ];

  const isActive = (href: string) => {
    if (href === '/operator') return pathname === href;
    return pathname.startsWith(href);
  };

  // Get cadet initials from email
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'OP';

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-68 bg-card/95 backdrop-blur-xl border-r border-border z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
        style={{ width: '17rem' }}
      >
        <div className="flex flex-col h-full">
          {/* Close button for mobile */}
          <div className="lg:hidden flex justify-end px-5 pt-4 pb-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cadet / User */}
          <div className="px-5 py-4 lg:pt-6 border-b border-border/60">
            <div className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-cosmic text-primary-foreground font-display text-xs font-bold flex-shrink-0 shadow-card">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] titlecase tracking-widest text-muted-foreground">Logged in as:</p>
                <p className="text-xs font-semibold text-foreground truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    group flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold text-sm transition-all duration-200
                    ${isActive(item.href)
                      ? 'bg-gradient-mars text-primary-foreground shadow-glow-mars'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Sign out */}
          <div className="px-3 pb-5 pt-3 border-t border-border/60">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}