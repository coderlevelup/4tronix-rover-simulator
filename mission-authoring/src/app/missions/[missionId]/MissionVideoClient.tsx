"use client";

import { useEffect, useState } from 'react';
import { Mission } from '@/core/domain/entities/Mission';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

function getYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export default function MissionVideoClient({ missionId }: { missionId: string }) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMission = async () => {
      try {
        const repository = new FirestoreMissionRepository(getFirestoreClient());
        const loadedMission = await repository.findById(missionId);

        if (loadedMission) {
          setMission(loadedMission);
        } else {
          setError('Mission not found');
        }
      } catch (err) {
        console.error('Fetch mission error:', err);
        setError('Failed to load mission');
      } finally {
        setLoading(false);
      }
    };
    void fetchMission();
  }, [missionId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500/25 border-t-orange-400"></div>
          </div>
          <p className="text-slate-300">Loading mission details...</p>
        </div>
      </main>
    );
  }

  if (error || !mission) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <span className="text-4xl block mb-4">⚠️</span>
          <h2 className="text-xl font-bold text-slate-200 mb-2">Error Loading Mission</h2>
          <p className="text-slate-400 mb-6">{error || 'Mission not found'}</p>
          <Link href="/missions" className="inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium">
            Return to Catalogue
          </Link>
        </div>
      </main>
    );
  }

  const youtubeId = getYouTubeId(mission.youtubeUrl || mission.videoUrl);
  const missionName = mission.name || `Mission ${mission.id.slice(0, 8)}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/missions" className="text-slate-400 hover:text-orange-400 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-100">{missionName}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="font-mono">{mission.yardId}</span>
            <span>•</span>
            <span>{new Date(mission.completedAt || mission.submittedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
              {youtubeId ? (
                <div className="relative aspect-video w-full bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                    title={missionName}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              ) : (
                <div className="relative aspect-video w-full bg-slate-800 flex flex-col items-center justify-center text-slate-500">
                  <svg className="h-16 w-16 text-slate-600 mb-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <p>Video not available</p>
                </div>
              )}
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Mission Details</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs mb-1">Status</p>
                  <p className="text-green-400 font-semibold">Completed</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">Duration</p>
                  <p className="text-slate-200 font-mono">
                    {mission.executionMetadata?.duration_ms ? `${Math.round(mission.executionMetadata.duration_ms / 1000)}s` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">Execution</p>
                  <p className={`font-semibold ${mission.executionResult?.isSuccessful ? 'text-green-400' : 'text-red-400'}`}>
                    {mission.executionResult?.isSuccessful ? 'Successful' : mission.executionResult ? 'Failed' : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0d1117] rounded-xl border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-300">Mission Code</h3>
                <button
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                  onClick={() => navigator.clipboard.writeText(mission.code)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <div className="p-4 overflow-auto max-h-[500px]">
                <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap">{mission.code}</pre>
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-900/20 to-rose-900/20 rounded-xl border border-orange-700/30 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-100 mb-2">Like this mission?</h3>
                  <p className="text-sm text-slate-300 mb-4">
                    Try running this code yourself on your own rover. Copy the code above and execute it in the operator console.
                  </p>
                  <button
                    onClick={() => {
                      localStorage.setItem('rover_monaco_code', mission.code);
                      window.location.href = '/mission?mode=code';
                    }}
                    className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Try it Yourself
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
