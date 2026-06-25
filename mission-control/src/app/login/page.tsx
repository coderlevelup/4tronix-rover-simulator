'use client';

import { OperatorLogin } from '@/components/operator/OperatorLogin';

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen place-items-center bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0 starfield animate-drift opacity-35" />
      <div className="pointer-events-none absolute inset-0 nebula opacity-30" />
      <div className="w-full max-w-md space-y-8 flex flex-col items-center">
        <div className="space-y-2 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
            Mars Rover Mission Control
          </p>
        </div>

        <OperatorLogin />
      </div>
    </main>
  );
}
