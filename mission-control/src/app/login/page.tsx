'use client';

import { OperatorLogin } from '@/components/operator/OperatorLogin';

export default function LoginPage() {
  return (
    <main className="relative grid h-[calc(100vh-64px)] place-items-center overflow-hidden px-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center space-y-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
          Mars Rover Mission Control
        </p>

        <OperatorLogin />
      </div>
    </main>
  );
}
