'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { RoverState } from '@/lib/rover-physics';
import { getLearnerID } from '@/lib/getLearnerID';
import { useLearner } from '@/contexts/LearnerContext';
import { validateMission } from '@/infrastructure/validation/schemas';
import { EditorPanel, type EditorMode } from '@/components/mission/EditorPanel';
import { SimulationPanel } from '@/components/mission/SimulationPanel';
import { MissionSubmitBar } from '@/components/mission/MissionSubmitBar';
import { simulateCommands } from '@/lib/simulateCommands';

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
  const { learnerEmail, openEmailPrompt } = useLearner();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as EditorMode) || 'manual';
  const initialCode = searchParams.get('code') ?? '';

  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
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

  // Run the commands through the client-side physics model and play the
  // trajectory in the simulator.
  const runSimulation = (commands: SimulationCommand[]) => {
    setError(null);
    const simulated = simulateCommands(commands);
    setTrajectory(simulated);
    setIsPlaying(true);
  };

  // Switching editor mode starts a clean simulator: clear the previous run's
  // trajectory so, e.g., Manual starts from an empty canvas.
  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
    setTrajectory([]);
    setIsPlaying(false);
    setError(null);
    manualTrajectoryLengthRef.current = 0;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

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
      // Clear the drawn path and park the rover back at the start. The reset
      // version bump tells ManualControlRealtime to reset its physics too, so
      // the next tap drives from the centre again.
      manualTrajectoryLengthRef.current = 0;
      setTrajectory([]);
      setManualResetVersion((version) => version + 1);
      setIsPlaying(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTrajectory([]);
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

      const response = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const result = await response.json();

      if (!response.ok || !result.success || !result.mission) {
        throw new Error(result.error || 'Failed to submit mission');
      }

      localStorage.setItem('rover-latest-mission-id', result.mission.id);

      setSubmitSuccess(true);
      setMissionName('');
      // Offer notifications once the mission is in (never on landing), and only
      // if the learner has not already saved an email.
      if (!learnerEmail) openEmailPrompt();
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
          onEditorModeChange={handleEditorModeChange}
          error={error}
          onManualTrajectory={handleManualTrajectory}
          onResetSimulation={handleResetSimulation}
          manualResetVersion={manualResetVersion}
          onGenerateCommands={runSimulation}
          onCodeChange={setCurrentCode}
          onBlocklyStateChange={setBlocklyState}
        />

        <SimulationPanel
          trajectory={trajectory}
          isPlaying={isPlaying}
          onReset={handleResetSimulation}
          editorMode={editorMode}
          resetVersion={manualResetVersion}
          // Name and launch live under the simulator so the block canvas keeps
          // the full height of its own column. Drive mode is excluded: it has
          // no code to send, and the simulator is on screen in every mode.
          footer={
            editorMode === 'manual' ? undefined : (
              <MissionSubmitBar
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
            )
          }
        />
      </div>
    </div>
  );
}
