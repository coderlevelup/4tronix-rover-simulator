'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { RoverState } from '@/lib/rover-physics';
import { getLearnerID } from '@/lib/getLearnerID';
import { useLearner } from '@/contexts/LearnerContext';
import { getFirestoreClient } from '@/lib/firebase';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';
import { MissionService } from '@/core/application/services/MissionService';
import { validateMission } from '@/infrastructure/validation/schemas';
import { EditorPanel, type EditorMode } from '@/components/mission/EditorPanel';
import { SimulationPanel } from '@/components/mission/SimulationPanel';

interface TrajectoryPoint {
  x: number;
  y: number;
  heading: number;
  speedL: number;
  speedR: number;
  servos: Record<string, number>;
}

type SimulationCommand = {
  command: string;
  speed?: number;
  duration?: number;
  degrees?: number;
};

export function MissionWorkspace() {
  const { learnerEmail } = useLearner();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as EditorMode) || 'manual';
  const initialCode = searchParams.get('code') ?? '';

  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simVideoUrl, setSimVideoUrl] = useState<string | null>(null);
  const [simVideoLoading, setSimVideoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [panelSplit, setPanelSplit] = useState(60);
  const [currentCode, setCurrentCode] = useState(initialCode);
  const [blocklyState, setBlocklyState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [missionName, setMissionName] = useState('');
  const [missionNameError, setMissionNameError] = useState<string | null>(null);
  const [showMissionNameValidation, setShowMissionNameValidation] = useState(false);
  const [isMissionNameValid, setIsMissionNameValid] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const manualTrajectoryLengthRef = useRef(0);
  const [manualResetVersion, setManualResetVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Apply CSS variables to the container via DOM to avoid JSX inline styles
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.setProperty('--workspace-left', `${panelSplit}fr`);
    containerRef.current.style.setProperty('--workspace-right', `${100 - panelSplit}fr`);
  }, [panelSplit]);

  const runSimulationVideo = async (commands: SimulationCommand[]) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setError(null);
    setSimVideoUrl(null);
    setSimVideoLoading(true);

    try {
      const response = await fetch('/api/simulate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        const message = err.error || err.details || `Simulation failed (${response.status})`;
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setSimVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimVideoLoading(false);
    }
  };

  const handleManualTrajectory = useCallback((realtimeTrajectory: RoverState[]) => {
    const converted: TrajectoryPoint[] = realtimeTrajectory.map((state) => ({
      x: state.x,
      y: state.y,
      heading: state.heading,
      speedL: state.speedL,
      speedR: state.speedR,
      servos: {
        '9': state.servos[9],
        '15': state.servos[15],
        '11': state.servos[11],
        '13': state.servos[13],
      },
    }));
    setTrajectory((previousTrajectory) => {
      const startIndex = manualTrajectoryLengthRef.current;
      if (converted.length <= startIndex) {
        return previousTrajectory;
      }

      manualTrajectoryLengthRef.current = converted.length;
      return [...previousTrajectory, ...converted.slice(startIndex)];
    });
    setIsPlaying(true);
  }, []);

  const handleResetSimulation = useCallback(() => {
    if (editorMode === 'manual') {
      manualTrajectoryLengthRef.current = 0;
      setManualResetVersion((version) => version + 1);
      setIsPlaying(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTrajectory([]);
    setSimVideoUrl(null);
    setIsPlaying(false);
    manualTrajectoryLengthRef.current = 0;
  }, [editorMode]);

  const handleSubmitToQueue = async () => {
    if (!currentCode.trim()) {
      setError('Please write some code first!');
      return;
    }

    if (!isMissionNameValid) {
      setError('Mission name is required! Please enter or generate a name.');
      setMissionNameError('Please enter mission name.');
      setShowMissionNameValidation(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSubmitSuccess(false);
    setShowMissionNameValidation(false);

    try {
      const learnerId = getLearnerID();
      let sessionId = localStorage.getItem('rover-session-id');
      if (!sessionId) {
        sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('rover-session-id', sessionId);
      }

      const validation = validateMission({
        code: currentCode,
        yardId: 'uct-rover-1',
        learnerId,
        sessionId,
        // Stamp the email when the learner has provided one so this mission
        // shows up in their cross-device history.
        ...(learnerEmail ? { learnerEmail } : {}),
        ...(editorMode === 'blockly' && blocklyState ? { blocklyState } : {}),
        name: missionName,
      });

      if (!validation.success) {
        setError(validation.errors?.join(' | ') || 'Validation failed');
        return;
      }

      const repository = new FirestoreMissionRepository(getFirestoreClient());
      const service = new MissionService(repository);
      const result = await service.submitMission(validation.data!);

      if (!result.success || !result.mission) {
        throw new Error(result.error || 'Failed to submit mission');
      }

      localStorage.setItem('rover-latest-mission-id', result.mission.id);

      setSubmitSuccess(true);
      setMissionName('');
      console.log('✅ Mission submitted to Firebase:', result.mission);
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit mission');
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="workspaceSplitGrid" ref={containerRef}>
        <EditorPanel
          panelSplit={panelSplit}
          onPanelSplitChange={setPanelSplit}
          editorMode={editorMode}
          onEditorModeChange={setEditorMode}
          error={error}
          onManualTrajectory={handleManualTrajectory}
          onResetSimulation={handleResetSimulation}
          manualResetVersion={manualResetVersion}
          onGenerateCommands={runSimulationVideo}
          onCodeChange={setCurrentCode}
          onBlocklyStateChange={setBlocklyState}
          missionName={missionName}
          onMissionNameChange={setMissionName}
          missionNameError={missionNameError}
          onMissionNameError={setMissionNameError}
          showMissionNameValidation={showMissionNameValidation}
          onMissionNameValidationChange={setIsMissionNameValid}
          onSubmit={handleSubmitToQueue}
          submitting={submitting}
          submitSuccess={submitSuccess}
          currentCode={currentCode}
          isMissionNameValid={isMissionNameValid}
        />

        <SimulationPanel
          trajectory={trajectory}
          isPlaying={isPlaying}
          onReset={handleResetSimulation}
          editorMode={editorMode}
          resetVersion={manualResetVersion}
          simVideoUrl={simVideoUrl}
          simVideoLoading={simVideoLoading}
        />
      </div>
    </div>
  );
}
