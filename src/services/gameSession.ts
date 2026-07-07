export type ControlMode = 'manual' | 'ai-llm' | 'rl-training' | 'rl-inference';
export type SessionStatus = 'idle' | 'running' | 'error';

export type ActiveController =
  | { type: 'none' }
  | { type: 'llm'; profileId: string }
  | { type: 'rl-training'; policyId: string | null }
  | { type: 'rl-inference'; policyId: string };

export interface GameSessionState {
  romChecksum: string;
  romName: string;
  controlMode: ControlMode;
  activeController: ActiveController;
  status: SessionStatus;
  errorMessage: string | null;
}

const INITIAL_STATE: GameSessionState = {
  romChecksum: '',
  romName: '',
  controlMode: 'manual',
  activeController: { type: 'none' },
  status: 'idle',
  errorMessage: null,
};

type Listener = (state: GameSessionState) => void;

/** In-memory GameSession state machine (data-model.md GameSession). */
export class GameSession {
  private state: GameSessionState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();

  getState(): GameSessionState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<GameSessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  romLoaded(romChecksum: string, romName: string): void {
    this.setState({
      romChecksum,
      romName,
      status: 'running',
      errorMessage: null,
      controlMode: 'manual',
      activeController: { type: 'none' },
    });
  }

  romLoadFailed(romName: string, error: string): void {
    this.setState({ romName, status: 'error', errorMessage: error });
  }

  /** Manual input always preempts any non-manual controller (FR-011/FR-009). */
  takeManualControl(): void {
    if (this.state.controlMode !== 'manual') {
      this.setState({ controlMode: 'manual', activeController: { type: 'none' } });
    }
  }

  enableLlmControl(profileId: string): void {
    if (this.state.status !== 'running') return;
    this.setState({ controlMode: 'ai-llm', activeController: { type: 'llm', profileId } });
  }

  startRlTraining(policyId: string | null): void {
    if (this.state.status !== 'running') return;
    this.setState({
      controlMode: 'rl-training',
      activeController: { type: 'rl-training', policyId },
    });
  }

  enableRlInference(policyId: string): void {
    if (this.state.status !== 'running') return;
    this.setState({
      controlMode: 'rl-inference',
      activeController: { type: 'rl-inference', policyId },
    });
  }

  reportError(error: string): void {
    this.setState({
      status: 'error',
      errorMessage: error,
      controlMode: 'manual',
      activeController: { type: 'none' },
    });
  }

  reset(): void {
    this.state = { ...INITIAL_STATE };
    for (const listener of this.listeners) listener(this.state);
  }
}
