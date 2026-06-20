'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SimulatorTrajectoryPanel } from '@/components/operator/SimulatorTrajectoryPanel';
import type { Mission } from '@/core/domain/entities/Mission';
import type { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { RoverTypeBadge } from '@/lib/rover-type-utils';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { OPERATOR_ID_HEADER, OPERATOR_ACCESS_HEADER, OPERATOR_YARDS_HEADER } from '@/infrastructure/auth/operator-claims';
import { ArrowLeft, AlertCircle, Video, Zap } from 'lucide-react';

type DispatchFeedback = {
  summary: string;
  validationErrors: string[];
  suggestions: string[];
};

export default function RoverControlClient({ missionId }: { missionId: string }) {
  const router = useRouter();
  const { operatorId, operatorRole, operatorYards } = useAuth();

  const [mission, setMission] = useState<Mission | null>(null);
  const [roverConfigs, setRoverConfigs] = useState<RoverConfig[]>([]);
  const [selectedRover, setSelectedRover] = useState<RoverConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roverConfigsLoading, setRoverConfigsLoading] = useState(true);
  const [roverConfigsError, setRoverConfigsError] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEmergencyStopping, setIsEmergencyStopping] = useState(false);
  const [emergencyStopConfirm, setEmergencyStopConfirm] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<DispatchFeedback | null>(null);
  const previousMissionStatus = useRef<string | null>(null);
  const operatorYardsKey = useMemo(() => (operatorYards ?? []).join(','), [operatorYards]);

  const parseDispatchFeedback = (payload: unknown): DispatchFeedback => {
    const unknownFeedback: DispatchFeedback = {
      summary: 'Failed to dispatch mission.',
      validationErrors: [],
      suggestions: [],
    };

    if (!payload || typeof payload !== 'object') {
      return unknownFeedback;
    }

    const body = payload as { error?: string; validation_errors?: string[] };
    let summary = body.error || unknownFeedback.summary;
    let validationErrors = Array.isArray(body.validation_errors) ? body.validation_errors : [];

    if (validationErrors.length === 0 && typeof body.error === 'string') {
      const jsonStart = body.error.indexOf('{');
      if (jsonStart >= 0) {
        const possibleJson = body.error.slice(jsonStart);
        try {
          const parsed = JSON.parse(possibleJson) as { error?: string; validation_errors?: string[] };
          summary = parsed.error || summary;
          validationErrors = Array.isArray(parsed.validation_errors) ? parsed.validation_errors : [];
        } catch {
          // Keep original summary if embedded JSON cannot be parsed.
        }
      }
    }

    const aliasMap: Record<string, string> = {
      steerLeft: 'spinLeft',
      steerRight: 'spinRight',
    };

    const suggestionSet = new Set<string>();

    for (const validationError of validationErrors) {
      const unknownCommandMatch = validationError.match(/Unknown rover command '([^']+)'/);
      if (!unknownCommandMatch) {
        continue;
      }

      const unknownCommand = unknownCommandMatch[1];
      const methodMatch = unknownCommand.match(/(?:rover\.)?([a-zA-Z_][a-zA-Z0-9_]*)/);
      const methodName = methodMatch?.[1];

      if (methodName && aliasMap[methodName]) {
        suggestionSet.add(`Replace ${methodName} with ${aliasMap[methodName]}.`);
      }
    }

    if (validationErrors.length > 0) {
      suggestionSet.add('Use approved commands such as forward, reverse, spinLeft, spinRight, stop, and setServo.');
    }

    return {
      summary,
      validationErrors,
      suggestions: Array.from(suggestionSet),
    };
  };

  const buildOperatorHeaders = () => {
    if (!operatorId || !operatorRole) {
      return {};
    }

    const headers: Record<string, string> = {
      [OPERATOR_ID_HEADER]: operatorId,
      [OPERATOR_ACCESS_HEADER]: operatorRole,
    };

    if (operatorYards?.length) {
      headers[OPERATOR_YARDS_HEADER] = operatorYards.join(',');
    }

    return headers;
  };

  useEffect(() => {
    void fetchMission();
  }, [missionId]);

  useEffect(() => {
    if (!operatorId || !operatorRole) {
      return;
    }

    void fetchRoverConfigs();
  }, [operatorId, operatorRole, operatorYardsKey]);

  useEffect(() => {
    if (!mission) {
      return;
    }

    if (mission.status !== 'queued' && mission.status !== 'processing') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchMission();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mission?.status]);

  useEffect(() => {
    if (!mission) {
      return;
    }

    const currentStatus = mission.status;
    const previousStatus = previousMissionStatus.current;

    if (previousStatus && previousStatus !== currentStatus) {
      if (currentStatus === 'completed') {
        toast.success('Mission completed successfully.');
      }

      if (currentStatus === 'failed') {
        toast.error('Mission failed. You can retry the mission.');
      }

      if (currentStatus === 'cancelled') {
        toast('Mission was cancelled.');
      }
    }

    previousMissionStatus.current = currentStatus;
  }, [mission]);

  useEffect(() => {
    if (!mission) {
      return;
    }

    if (mission.status === 'processing' || mission.status === 'completed') {
      setDispatchFeedback(null);
    }
  }, [mission?.status]);

  const fetchMission = async () => {
    try {
      const response = await fetch(`/api/operator/missions/${missionId}`);
      const data = await response.json();

      if (data.success && data.mission) {
        setMission(data.mission);
      } else {
        setError(data.error || 'Mission not found');
      }
    } catch (err) {
      setError('Failed to load mission');
      console.error('Fetch mission error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoverConfigs = async () => {
    setRoverConfigsLoading(true);
    setRoverConfigsError('');

    try {
      const response = await fetch('/api/operator/rover-configs', {
        headers: buildOperatorHeaders() as HeadersInit,
      });
      const data = await response.json();

      if (!response.ok) {
        setRoverConfigs([]);
        setSelectedRover(null);
        setRoverConfigsError(data.error || 'Failed to load rover configs');
        return;
      }

      if (data.success && data.configs) {
        setRoverConfigs(data.configs);
        // Get active config
        const activeResponse = await fetch('/api/operator/rover-configs/active', {
          headers: buildOperatorHeaders() as HeadersInit,
        });
        const activeData = await activeResponse.json();

        if (activeData.success && activeData.config) {
          setSelectedRover(activeData.config);
        } else if (data.configs.length > 0) {
          // Default to first config if no active one
          setSelectedRover(data.configs[0]);
        } else {
          setSelectedRover(null);
        }
      } else {
        setRoverConfigs([]);
        setSelectedRover(null);
        setRoverConfigsError(data.error || 'Failed to load rover configs');
      }
    } catch (err) {
      console.error('Fetch rover configs error:', err);
      setRoverConfigs([]);
      setSelectedRover(null);
      setRoverConfigsError('Failed to load rover configs');
    } finally {
      setRoverConfigsLoading(false);
    }
  };

  const handleExecuteMission = async () => {
    if (!selectedRover) {
      toast.error('Please select a rover first');
      return;
    }

    setIsExecuting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (operatorId && operatorRole) {
        headers[OPERATOR_ID_HEADER] = operatorId;
        headers[OPERATOR_ACCESS_HEADER] = operatorRole;
        if (operatorYards?.length) {
          headers[OPERATOR_YARDS_HEADER] = operatorYards.join(',');
        }
      }

      const response = await fetch(`/api/operator/missions/${missionId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'execute' }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setDispatchFeedback(null);
        toast.success('Mission dispatched to rover successfully!');
        await fetchMission();
      } else {
        const feedback = parseDispatchFeedback(data);
        setDispatchFeedback(feedback);
        toast.error(feedback.summary || 'Failed to dispatch mission');
      }
    } catch (err) {
      console.error('Execute mission error:', err);
      setDispatchFeedback({
        summary: 'Failed to connect to rover dispatch service.',
        validationErrors: [],
        suggestions: ['Check network connectivity and rover server status, then retry.'],
      });
      toast.error('Failed to connect to server');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRoverChange = async (configId: string) => {
    const config = roverConfigs.find(c => c.id === configId);
    if (config) {
      setSelectedRover(config);
      // Set as active
      try {
        const response = await fetch('/api/operator/rover-configs/active', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildOperatorHeaders(),
          },
          body: JSON.stringify({ configId }),
        });

        if (!response.ok) {
          throw new Error('Failed to set active rover');
        }
      } catch (err) {
        console.error('Failed to set active config:', err);
        toast.error('Failed to update active rover');
      }
    }
  };

  const handleEmergencyStop = async () => {
    if (!emergencyStopConfirm) {
      setEmergencyStopConfirm(true);
      return;
    }

    setIsEmergencyStopping(true);
    try {
      const response = await fetch(`/api/operator/rover/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Emergency stop activated! Rover has been stopped.');
      } else {
        alert(`Emergency stop failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Emergency stop error:', err);
      alert('Failed to send emergency stop command');
    } finally {
      setIsEmergencyStopping(false);
      setEmergencyStopConfirm(false);
    }
  };

  const missionStatusMeta = (() => {
    if (!mission) {
      return {
        title: 'Loading mission status',
        message: 'Checking the latest mission state...',
        tone: 'text-slate-300 border-slate-700/70 bg-slate-900/50',
      };
    }

    if (mission.status === 'queued') {
      return {
        title: 'Mission queued',
        message: 'The mission is ready. Select a rover and execute when ready.',
        tone: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
      };
    }

    if (mission.status === 'processing') {
      return {
        title: 'Mission in progress',
        message: 'Execution is running. This panel auto-refreshes every few seconds.',
        tone: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
      };
    }

    if (mission.status === 'completed') {
      return {
        title: 'Mission successful',
        message: 'Execution finished successfully. You can return to the mission list.',
        tone: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10',
      };
    }

    if (mission.status === 'failed') {
      return {
        title: 'Mission failed',
        message: mission.executionResult?.errorMessage || 'Execution failed. Review and retry if needed.',
        tone: 'text-red-200 border-red-500/40 bg-red-500/10',
      };
    }

    return {
      title: 'Mission cancelled',
      message: 'This mission was cancelled. You can return to the mission list or retry.',
      tone: 'text-orange-200 border-orange-500/30 bg-orange-500/10',
    };
  })();

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        {/* Ambient cosmic twinkles */}
        <span className="pointer-events-none fixed left-[15%] top-[10%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-60" />
        <span className="pointer-events-none fixed left-[72%] top-[8%] h-1.5 w-1.5 rounded-full bg-mars-glow animate-twinkle shadow-[0_0_8px_2px_oklch(0.78_0.18_55)] opacity-70" style={{ animationDelay: '1.2s' }} />
        <span className="pointer-events-none fixed left-[88%] top-[30%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-40" style={{ animationDelay: '2.1s' }} />
        <span className="pointer-events-none fixed left-[5%] top-[55%] h-1 w-1 rounded-full bg-accent animate-twinkle opacity-50" style={{ animationDelay: '0.7s' }} />
        <span className="pointer-events-none fixed left-[92%] top-[70%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-30" style={{ animationDelay: '3s' }} />

        <div className="text-center space-y-4">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-primary shadow-glow-mars"></div>
            <div className="absolute inset-2 animate-pulse rounded-full bg-primary/10"></div>
          </div>
          <p className="font-display text-base font-bold text-foreground">Loading mission...</p>
        </div>
      </main>
    );
  }

  if (error || !mission) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        {/* Ambient cosmic twinkles */}
        <span className="pointer-events-none fixed left-[15%] top-[10%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-60" />
        <span className="pointer-events-none fixed left-[72%] top-[8%] h-1.5 w-1.5 rounded-full bg-mars-glow animate-twinkle shadow-[0_0_8px_2px_oklch(0.78_0.18_55)] opacity-70" style={{ animationDelay: '1.2s' }} />
        <span className="pointer-events-none fixed left-[88%] top-[30%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-40" style={{ animationDelay: '2.1s' }} />
        <span className="pointer-events-none fixed left-[5%] top-[55%] h-1 w-1 rounded-full bg-accent animate-twinkle opacity-50" style={{ animationDelay: '0.7s' }} />
        <span className="pointer-events-none fixed left-[92%] top-[70%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-30" style={{ animationDelay: '3s' }} />

        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur-xl p-8 shadow-card max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-display text-base font-bold text-destructive">Error Loading Mission</p>
              <p className="font-mono text-sm text-destructive/70 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/operator')}
            className="mt-4 w-full rounded-2xl bg-muted px-4 py-2.5 font-semibold text-sm text-foreground hover:bg-muted/80 transition-colors"
          >
            Back to Operator Console
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <main className="h-screen bg-background flex overflow-hidden">
        {/* Ambient cosmic twinkles */}
        <span className="pointer-events-none fixed left-[15%] top-[10%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-60" />
        <span className="pointer-events-none fixed left-[72%] top-[8%] h-1.5 w-1.5 rounded-full bg-mars-glow animate-twinkle shadow-[0_0_8px_2px_oklch(0.78_0.18_55)] opacity-70" style={{ animationDelay: '1.2s' }} />
        <span className="pointer-events-none fixed left-[88%] top-[30%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-40" style={{ animationDelay: '2.1s' }} />
        <span className="pointer-events-none fixed left-[5%] top-[55%] h-1 w-1 rounded-full bg-accent animate-twinkle opacity-50" style={{ animationDelay: '0.7s' }} />
        <span className="pointer-events-none fixed left-[92%] top-[70%] h-1 w-1 rounded-full bg-white animate-twinkle opacity-30" style={{ animationDelay: '3s' }} />

        {/* Left Sidebar - Mission Details */}
        <aside className="w-64 bg-card/60 backdrop-blur-xl border-r border-border p-3 flex flex-col overflow-y-auto">
          <div className="mb-3">
            <button
              onClick={() => router.push('/operator')}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Console
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto">
            {/* Mission Name - Compact */}
            <div className="pb-3 border-b border-border">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Mission</p>
              <p className="font-display text-sm font-bold text-foreground truncate">
                {mission.name || 'Untitled Mission'}
              </p>
            </div>

            {/* Mission Code - Compact */}
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Code
              </p>
              <div className="bg-background/60 rounded-xl border border-border p-2.5 max-h-40 overflow-y-auto">
                <pre className="text-xs text-foreground/90 font-mono whitespace-pre-wrap leading-tight">
                  {mission.code}
                </pre>
              </div>
            </div>

            {/* Rover Selection */}
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Rover
              </p>
              {roverConfigsLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : roverConfigsError ? (
                <p className="text-xs text-destructive">Error</p>
              ) : roverConfigs.length > 0 ? (
                <>
                  <select
                    value={selectedRover?.id || ''}
                    onChange={(e) => handleRoverChange(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  >
                    {roverConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                  {selectedRover && (
                    <div className="mt-1.5 text-xs font-mono text-muted-foreground truncate">
                      {selectedRover.ipAddress}:{selectedRover.port}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">None</p>
              )}
            </div>

            {/* Mission Info */}
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Status</span>
                <span className={`text-xs font-bold ${
                  mission.status === 'processing' ? 'text-[oklch(0.78_0.18_55)]' :
                  mission.status === 'queued' ? 'text-foreground' :
                  mission.status === 'completed' ? 'text-[oklch(0.74_0.18_175)]' : 'text-destructive'
                }`}>
                  {mission.status === 'queued' ? 'Ready' :
                   mission.status === 'processing' ? 'Running' :
                   mission.status === 'completed' ? 'Done' : 'Failed'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Time</span>
                <span className="text-xs font-mono text-foreground">
                  {new Date(mission.submittedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Side - Rover Footage / Simulator */}
        <div className="flex-1 flex flex-col">
          <header className="bg-card/40 backdrop-blur-xl border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {selectedRover?.roverType === 'simulator' ? 'Simulator' : 'Camera Feed'}
                </h1>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                  Real-time mission execution
                </p>
              </div>
              <div className="flex items-center gap-3">
                {mission.status === 'processing' && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                    Live
                  </div>
                )}
                {mission.status === 'queued' && (
                  <button
                    onClick={handleExecuteMission}
                    disabled={isExecuting || !selectedRover}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 font-display text-sm font-bold transition-all ${
                      isExecuting || !selectedRover
                        ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                        : 'bg-gradient-mars text-primary-foreground shadow-glow-mars hover:-translate-y-0.5'
                    }`}
                  >
                    <Zap className="h-4 w-4" />
                    {isExecuting ? 'Executing...' : 'Execute Mission'}
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4">
              <div className={`rounded-2xl border p-4 backdrop-blur ${missionStatusMeta.tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-sm font-bold truncate">{missionStatusMeta.title}</p>
                    <p className="font-mono text-xs text-current/70 mt-1">{missionStatusMeta.message}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(mission.status === 'failed' || mission.status === 'cancelled') && (
                      <button
                        onClick={handleExecuteMission}
                        disabled={isExecuting || !selectedRover}
                        className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 font-display text-xs font-bold transition-all ${
                          isExecuting || !selectedRover
                            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                            : 'bg-gradient-mars text-primary-foreground shadow-glow-mars hover:-translate-y-0.5'
                        }`}
                      >
                        {isExecuting ? '...' : 'Retry'}
                      </button>
                    )}

                    {(mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') && (
                      <button
                        onClick={() => router.push('/operator')}
                        className="rounded-2xl border border-border bg-muted/60 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                      >
                        Back to Console
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {dispatchFeedback && (
                <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur p-4">
                  <p className="font-display text-sm font-bold text-destructive">{dispatchFeedback.summary}</p>
                  {dispatchFeedback.validationErrors.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {dispatchFeedback.validationErrors.map((err, i) => (
                        <li key={i} className="text-xs text-destructive/80 font-mono">{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Camera Feed / Simulator Area */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
              {selectedRover?.roverType === 'simulator' ? (
                <SimulatorTrajectoryPanel mission={mission} pollingEnabled={true} />
              ) : (
                // Camera Feed View
                <div className="w-full max-w-3xl h-[400px] bg-background/60 border border-border rounded-2xl overflow-hidden shadow-card backdrop-blur">
                  <div className="text-center space-y-4 flex flex-col items-center justify-center h-full">
                    <div className="relative mx-auto h-20 w-20">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-muted to-card flex items-center justify-center">
                        <Video className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-4 border-border border-t-primary animate-spin"></div>
                    </div>
                    <p className="font-display text-xl font-bold text-foreground">
                      Rover footage will show here
                    </p>
                    <p className="font-mono text-sm text-muted-foreground">
                      Camera feed from the physical rover
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Emergency Stop Button */}
            <div className="border-t border-border bg-card/40 backdrop-blur-xl px-6 py-4">
              {!emergencyStopConfirm ? (
                <button
                  onClick={handleEmergencyStop}
                  disabled={isEmergencyStopping}
                  className="w-full rounded-2xl bg-destructive px-6 py-3 font-display text-sm font-bold text-destructive-foreground hover:bg-destructive/90 transition-all disabled:opacity-50 shadow-card"
                >
                  EMERGENCY STOP
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleEmergencyStop}
                    disabled={isEmergencyStopping}
                    className="flex-1 rounded-2xl bg-destructive px-4 py-3 font-display text-sm font-bold text-destructive-foreground hover:bg-destructive/90 transition-all disabled:opacity-50 shadow-card"
                  >
                    {isEmergencyStopping ? 'Stopping...' : 'CONFIRM STOP'}
                  </button>
                  <button
                    onClick={() => setEmergencyStopConfirm(false)}
                    disabled={isEmergencyStopping}
                    className="flex-1 rounded-2xl border border-border bg-muted px-4 py-3 font-display text-sm font-bold text-foreground hover:bg-muted/80 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
