"use client";

import React from 'react';
import OperatorMissionCard from '@/components/OperatorMissionCard/OperatorMissionCard';

// Lightweight example operator page showing the new components. Intended as a
// demo harness only — integration should call real services via props.

const mockMissions = [
  {
    id: 'mission-1',
    name: 'Collect soil sample',
    yardId: 'YARD-1',
    submittedAt: new Date().toISOString(),
    status: 'queued',
    learnerId: 'learner-abc',
  },
  {
    id: 'mission-2',
    name: 'Drive to waypoint',
    yardId: 'YARD-1',
    submittedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    status: 'processing',
    learnerId: 'learner-xyz',
  },
  {
    id: 'mission-3',
    name: 'Take panorama',
    yardId: 'YARD-2',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: 'completed',
    learnerId: 'learner-123',
  },
];

export default function OperatorPage() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Operator Console (Demo)</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {mockMissions.map((m) => (
          // @ts-ignore - demo mock object shaped like Mission
          <OperatorMissionCard key={m.id} mission={m} onStart={async (id) => alert(`Start ${id}`)} onMarkComplete={async (id) => alert(`Mark complete ${id}`)} onAddVideo={async (id, url) => alert(`Attach ${url} to ${id}`)} />
        ))}
      </div>
    </div>
  );
}
