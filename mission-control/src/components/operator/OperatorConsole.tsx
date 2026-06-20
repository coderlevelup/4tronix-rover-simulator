'use client';

import { useState } from 'react';
import { OperatorSidebar } from './OperatorSidebar';
import { Menu, Zap } from 'lucide-react';

interface OperatorConsoleProps {
  children: React.ReactNode;
}

export function OperatorConsole({ children }: OperatorConsoleProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Ambient cosmic twinkles */}
      <span className="pointer-events-none fixed left-[15%] top-[10%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-60" />
      <span className="pointer-events-none fixed left-[72%] top-[8%] h-1.5 w-1.5 rounded-full bg-mars-glow animate-twinkle shadow-[0_0_8px_2px_oklch(0.78_0.18_55)] opacity-70" style={{ animationDelay: '1.2s' }} />
      <span className="pointer-events-none fixed left-[88%] top-[30%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-40" style={{ animationDelay: '2.1s' }} />
      <span className="pointer-events-none fixed left-[5%] top-[55%] h-1 w-1 rounded-full bg-accent animate-twinkle opacity-50" style={{ animationDelay: '0.7s' }} />
      <span className="pointer-events-none fixed left-[92%] top-[70%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-30" style={{ animationDelay: '3s' }} />

      <OperatorSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex-shrink-0 border-b border-border bg-card/60 backdrop-blur-xl px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-mars shadow-glow-mars">
                  <Zap className="h-5 w-5 text-primary-foreground animate-blast" />
                </div>
                <div className="hidden sm:block">
                  <p className="font-display text-sm font-bold text-foreground leading-none">Mission Control</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Operator Console</p>
                </div>
              </div>
            </div>

            {/* Live pill — matches landing page badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-glow-mars">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Online
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}