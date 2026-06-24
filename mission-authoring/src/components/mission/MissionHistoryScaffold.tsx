'use client';

import { useEffect, useMemo, useState } from 'react';
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-3 text-sm">
      <p className="text-slate-400">
        Showing missions for{' '}
        <span className="font-semibold text-slate-200">{learnerEmail}</span> — synced across your devices.
      </p>
      <button
        onClick={openEmailPrompt}
        className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
      >
        Change
      </button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm">
      <p className="text-slate-300">
        Add your email to see your missions on any device.
      </p>
      <button
        onClick={openEmailPrompt}
        className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-orange-400"
      >
        Add email
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {emailBanner}
        <div className="rounded-2xl bg-slate-950/60 p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" />
          <p className="mt-4 text-sm text-slate-400">Loading mission history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {emailBanner}

      {missions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-4">No missions yet</p>
          <p className="mt-2 text-xs text-slate-500">Submit your first mission to see it here</p>
        </div>
      ) : (
        missions.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))
      )}
    </div>
  );
}
