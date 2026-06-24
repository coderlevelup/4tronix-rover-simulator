'use client';

/**
 * Operator console — lists queued (not-yet-run) missions with their stored
 * Python so an operator can copy it and run it at the yard.
 *
 * Gated client-side via useAuth().isOperator; the proxy (src/proxy.ts) also
 * guards /operator server-side (redirects non-operators to /login), and the
 * GET /api/operator/missions route enforces verifyOperatorAuth.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Mission } from '@/core/domain/entities/Mission';

export default function OperatorPage() {
  const { isOperator, loading: authLoading } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isOperator) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/operator/missions');
        if (res.status === 401) {
          throw new Error('Your session is not authorized as an operator.');
        }
        if (!res.ok) {
          throw new Error(`Failed to load missions (HTTP ${res.status})`);
        }
        const data = await res.json();
        const queued = ((data.missions as Mission[]) ?? [])
          .filter((m) => m.status === 'queued')
          .sort(
            (a, b) =>
              new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
          );
        if (!cancelled) {
          setMissions(queued);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load missions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isOperator]);

  const copyPython = async (mission: Mission) => {
    try {
      await navigator.clipboard.writeText(mission.code);
      setCopiedId(mission.id);
      setTimeout(
        () => setCopiedId((current) => (current === mission.id ? null : current)),
        2000
      );
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
      </main>
    );
  }

  if (!isOperator) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Operator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an operator account to view this page.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Go to operator login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
          Operator Console
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Queued missions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Missions waiting to be run — copy the Python and run it at the yard.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : missions.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg font-bold text-foreground">No queued missions</p>
          <p className="mt-2 text-sm text-muted-foreground">New submissions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {missions.map((mission) => (
            <article
              key={mission.id}
              className="overflow-hidden rounded-2xl border border-border/60 bg-card/50"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-bold text-foreground">
                    {mission.name || `Mission-${mission.id.slice(0, 8)}`}
                  </h2>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {mission.yardId} · {new Date(mission.submittedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => copyPython(mission)}
                  className="shrink-0 rounded-full bg-gradient-mars px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  {copiedId === mission.id ? 'Copied ✓' : 'Copy Python'}
                </button>
              </div>
              <pre className="max-h-80 overflow-auto bg-background/80 p-4 text-xs leading-relaxed text-foreground">
                <code>{mission.code.trim() || '// No code'}</code>
              </pre>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
