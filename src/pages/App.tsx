import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Display } from '../components/Display/Display';
import { Controller } from '../components/Controller/Controller';
import { useKeyboardControls } from '../components/Controller/useKeyboardControls';
import { RomLoader } from '../components/RomLoader/RomLoader';
import { SaveStatePanel } from '../components/SaveLoadPanel/SaveStatePanel';
import { LoadStatePanel } from '../components/SaveLoadPanel/LoadStatePanel';
import { AIControlPanel } from '../components/AIControlPanel/AIControlPanel';
import { RLTrainingPanel } from '../components/RLTrainingPanel/RLTrainingPanel';
import { RLMetricsView } from '../components/RLTrainingPanel/RLMetricsView';
import { RLPolicyLibrary } from '../components/RLTrainingPanel/RLPolicyLibrary';
import { MgbaEmulatorCore } from '../emulator/core';
import { GameSession } from '../services/gameSession';
import { DecisionLoop } from '../ai/decisionLoop';
import { DEFAULT_AI_CONTROLLER_PROFILE, type AIControllerProfile } from '../ai/aiControllerProfile';
import { RLTrainingController, FRAME_SIZE, type TrainingMetrics } from '../rl/trainingController';
import { DqnAgent } from '../rl/dqnAgent';
import { RL_ACTIONS } from '../rl/actionSpace';
import { saveRLPolicy, loadRLPolicyModel } from '../storage/rlPolicies';

const INITIAL_RL_METRICS: TrainingMetrics = {
  status: 'stopped',
  episodeCount: 0,
  episodeReward: 0,
  rewardHistory: [],
  totalSteps: 0,
  noveltyDiscoveryRate: 0,
  noveltyRateHistory: [],
};

export function App() {
  const core = useMemo(() => new MgbaEmulatorCore(), []);
  const session = useMemo(() => new GameSession(), []);
  const state = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getState(),
  );
  const [saveStateRefreshKey, setSaveStateRefreshKey] = useState(0);
  const [rlPolicyRefreshKey, setRlPolicyRefreshKey] = useState(0);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [rlMetrics, setRlMetrics] = useState<TrainingMetrics>(INITIAL_RL_METRICS);
  const profileRef = useRef<AIControllerProfile>(DEFAULT_AI_CONTROLLER_PROFILE);
  const activeRlPolicyIdRef = useRef<string | null>(null);

  const decisionLoop = useMemo(
    () =>
      new DecisionLoop(
        core,
        () => profileRef.current,
        (message) => session.reportError(message),
        (message) => setAiMessage(message),
      ),
    [core, session],
  );

  const rlController = useMemo(
    () =>
      new RLTrainingController(
        core,
        (metrics) => setRlMetrics(metrics),
        (message) => session.reportError(message),
      ),
    [core, session],
  );

  // Manual input (keyboard or on-screen) always preempts any automated
  // controller (FR-011/FR-009) — pausing RL preserves its progress rather
  // than discarding it, unlike the LLM controller which has no state to keep.
  const takeManualControl = () => {
    const prevMode = session.getState().controlMode;
    session.takeManualControl();
    if (prevMode === 'ai-llm') decisionLoop.stop();
    if (prevMode === 'rl-training' || prevMode === 'rl-inference') rlController.pause();
  };

  useKeyboardControls(core, takeManualControl);

  useEffect(() => {
    if (state.controlMode !== 'ai-llm') {
      decisionLoop.stop();
      setAiMessage(null);
    }
  }, [state.controlMode, decisionLoop]);

  useEffect(() => {
    if (state.controlMode !== 'rl-training' && state.controlMode !== 'rl-inference') {
      rlController.pause();
    }
  }, [state.controlMode, rlController]);

  useEffect(() => () => decisionLoop.stop(), [decisionLoop]);
  useEffect(() => () => rlController.dispose(), [rlController]);

  const hasActiveRom = state.status === 'running' || state.status === 'error';
  const isRlActive = state.controlMode === 'rl-training' || state.controlMode === 'rl-inference';

  const handleRunPolicyAsController = async (policyId: string) => {
    try {
      const model = await loadRLPolicyModel(policyId);
      const agent = new DqnAgent({
        actionCount: RL_ACTIONS.length,
        inputWidth: FRAME_SIZE,
        inputHeight: FRAME_SIZE,
      });
      await agent.loadFrom(model);
      activeRlPolicyIdRef.current = policyId;
      session.enableRlInference(policyId);
      rlController.runInference(agent);
    } catch (error) {
      session.reportError(error instanceof Error ? error.message : 'Failed to load RL policy.');
    }
  };

  const handleResumeTrainingFromPolicy = async (policyId: string) => {
    try {
      const model = await loadRLPolicyModel(policyId);
      const agent = new DqnAgent({
        actionCount: RL_ACTIONS.length,
        inputWidth: FRAME_SIZE,
        inputHeight: FRAME_SIZE,
      });
      await agent.loadFrom(model);
      activeRlPolicyIdRef.current = policyId;
      rlController.useAgent(agent);
      session.startRlTraining(policyId);
      rlController.start();
    } catch (error) {
      session.reportError(error instanceof Error ? error.message : 'Failed to load RL policy.');
    }
  };

  const handleSavePolicy = async (label: string) => {
    try {
      await saveRLPolicy(
        rlController.getAgent().getModel(),
        state.romChecksum,
        label,
        { episodesTrained: rlMetrics.episodeCount, totalSteps: rlMetrics.totalSteps },
        activeRlPolicyIdRef.current ?? undefined,
      );
      setRlPolicyRefreshKey((key) => key + 1);
    } catch (error) {
      session.reportError(error instanceof Error ? error.message : 'Failed to save RL policy.');
    }
  };

  return (
    <main>
      <h1>RNNPokemon — GBA in the Browser</h1>
      <RomLoader core={core} session={session} />
      {state.status === 'error' && (
        <p role="alert" data-testid="session-error">
          {state.errorMessage}
        </p>
      )}
      <Display core={core} />
      <Controller core={core} onManualInput={takeManualControl} />
      {hasActiveRom && (
        <>
          {isRlActive ? (
            <p data-testid="save-load-blocked-by-rl">
              Save/load is unavailable while RL training or inference is active.
            </p>
          ) : (
            <>
              <SaveStatePanel
                core={core}
                romChecksum={state.romChecksum}
                onSaved={() => setSaveStateRefreshKey((key) => key + 1)}
              />
              <LoadStatePanel
                core={core}
                romChecksum={state.romChecksum}
                refreshKey={saveStateRefreshKey}
                onLoaded={takeManualControl}
                onError={(message) => session.reportError(message)}
              />
            </>
          )}
          <AIControlPanel
            active={state.controlMode === 'ai-llm'}
            onEnable={(profile) => {
              profileRef.current = profile;
              session.enableLlmControl(profile.id);
              decisionLoop.start();
            }}
            onDisable={takeManualControl}
            onError={(message) => session.reportError(message)}
          />
          {state.controlMode === 'ai-llm' && aiMessage && (
            <p data-testid="ai-message">
              <strong>AI:</strong> {aiMessage}
            </p>
          )}
          <RLTrainingPanel
            status={rlMetrics.status}
            onStart={() => {
              activeRlPolicyIdRef.current = null;
              session.startRlTraining(null);
              rlController.start();
            }}
            onPause={() => {
              rlController.pause();
              session.takeManualControl();
            }}
            onResume={() => {
              session.startRlTraining(activeRlPolicyIdRef.current);
              rlController.resume();
            }}
            onReset={() => {
              activeRlPolicyIdRef.current = null;
              rlController.reset();
              session.takeManualControl();
            }}
            onSavePolicy={handleSavePolicy}
          />
          {state.controlMode === 'rl-training' && <RLMetricsView metrics={rlMetrics} />}
          <RLPolicyLibrary
            romChecksum={state.romChecksum}
            refreshKey={rlPolicyRefreshKey}
            onRunAsController={(policyId) => void handleRunPolicyAsController(policyId)}
            onResumeTraining={(policyId) => void handleResumeTrainingFromPolicy(policyId)}
          />
        </>
      )}
    </main>
  );
}
