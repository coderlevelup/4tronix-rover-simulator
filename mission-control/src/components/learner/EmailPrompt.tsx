'use client';

import React, { useEffect, useState } from 'react';
import { useLearner } from '@/contexts/LearnerContext';

/**
 * Non-blocking email capture prompt, opened after a mission is submitted (to
 * offer notifications) and from the history page - never on landing. Saving
 * persists via LearnerContext (localStorage + Firestore); skipping just closes
 * it, email is optional.
 */
export function EmailPrompt() {
  const { learnerEmail, setLearnerEmail, showEmailPrompt, closeEmailPrompt } = useLearner();
  const [email, setEmail] = useState(learnerEmail ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(learnerEmail ?? '');
  }, [learnerEmail, showEmailPrompt]);

  if (!showEmailPrompt) return null;

  const isValid = (value: string) => /^[^\s@]+@([^\s@]+\.)+[A-Za-z]{2,}$/.test(value.trim());

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !isValid(email)) {
      setError('Please enter a valid email address');
      return;
    }
    await setLearnerEmail(email.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-4 py-8">
      <div className="absolute inset-0 bg-black/60" onClick={closeEmailPrompt} />
      <form
        onSubmit={handleSubmit}
        className="relative z-[101] w-full max-w-md rounded-2xl border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-bold">Stay in touch</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter your email so we can send mission updates and completion notices. This is optional - you can skip it.
        </p>

        <label className="mt-4 block">
          <input
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              setError(null);
            }}
            placeholder="you@school.edu"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="mt-2 w-full rounded-xl border border-border bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeEmailPrompt}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-card/50"
          >
            Skip
          </button>
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-900/20"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export default EmailPrompt;
