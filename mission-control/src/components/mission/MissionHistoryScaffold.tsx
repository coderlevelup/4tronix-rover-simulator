'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Rocket, Plus } from 'lucide-react';
import { getLearnerID } from '@/lib/getLearnerID';
import {
  subscribeMissionsByLearnerId,
  subscribeMissionsByLearnerEmail,
} from '@/lib/services/missionQueryService';
import { Mission } from '@/core/domain/entities/Mission';
import { MissionCard } from '@/components/MissionCard/MissionCard';
import { useLearner } from '@/contexts/LearnerContext';

export function MissionHistoryScaffold() {
  const { learnerEmail, openEmailPrompt } = useLearner();

  // Missions for this browser (by learner id) and, if an email is set, missions
  // submitted under that email on any device. We keep them separate and merge
  // so a learner sees their full history regardless of which one a mission was
  // stamped with.
  const [byId, setById] = useState<Mission[]>([]);
  const [byEmail, setByEmail] = useState<Mission[]>([]);
  const [idLoaded, setIdLoaded] = useState(false);
  const [emailLoaded, setEmailLoaded] = useState(false);

  useEffect(() => {
    try {
      const id = getLearnerID();
      const unsubscribe = subscribeMissionsByLearnerId(id, (missions) => {
        setById(missions);
        setIdLoaded(true);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Failed to initialize mission history:', error);
      setIdLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!learnerEmail) {
      setByEmail([]);
      setEmailLoaded(true);
      return;
    }
    setEmailLoaded(false);
    const unsubscribe = subscribeMissionsByLearnerEmail(learnerEmail, (missions) => {
      setByEmail(missions);
      setEmailLoaded(true);
    });
    return () => unsubscribe();
  }, [learnerEmail]);

  const missions = useMemo(() => {
    const merged = new Map<string, Mission>();
    for (const mission of [...byId, ...byEmail]) {
      merged.set(mission.id, mission);
    }
    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }, [byId, byEmail]);

  const isLoading = !idLoaded || !emailLoaded;

  // Banner: prompt for an email when none is set, or show which email is in use.
  const emailBanner = learnerEmail ? (
    <div className="flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/50 px-5 py-3 text-sm">
      <p className="min-w-0 text-muted-foreground">
        Showing missions for{' '}
        <span className="font-semibold text-foreground">{learnerEmail}</span> (synced across your devices).
      </p>
      <button
        onClick={openEmailPrompt}
        className="clay-press shrink-0 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground"
      >
        Change
      </button>
    </div>
  ) : (
    <div className="flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm">
      <p className="min-w-0 text-foreground">
        Add your email to see your missions on any device.
      </p>
      <button
        onClick={openEmailPrompt}
        className="clay clay-press shrink-0 rounded-full bg-gradient-mars px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
      >
        Add email
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {emailBanner}
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/30 p-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading your missions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {emailBanner}

      {missions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card/60 clay">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <p className="mt-5 font-display text-xl font-bold text-foreground">No missions yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Build your first mission and it will show up here.</p>
          <Link
            href="/mission"
            className="clay clay-press mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-mars px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Create Mission
          </Link>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scroll-panel pb-1">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {missions.map((mission) => (
              <MissionCard key={mission.id} mission={mission} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
