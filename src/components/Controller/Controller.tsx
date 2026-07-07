import type { EmulatorCore, GbaButton } from '../../emulator/types';

interface ControllerProps {
  core: EmulatorCore;
  onManualInput: () => void;
}

const DPAD: GbaButton[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const FACE: GbaButton[] = ['A', 'B'];
const SYSTEM: GbaButton[] = ['SELECT', 'START'];
const SHOULDER: GbaButton[] = ['L', 'R'];

/** On-screen GBA button pad (FR-003). */
export function Controller({ core, onManualInput }: ControllerProps) {
  const press = (button: GbaButton) => () => {
    onManualInput();
    core.pressButton(button);
  };
  const release = (button: GbaButton) => () => {
    core.releaseButton(button);
  };

  const renderButton = (button: GbaButton) => (
    <button
      key={button}
      type="button"
      data-testid={`gba-button-${button}`}
      onPointerDown={press(button)}
      onPointerUp={release(button)}
      onPointerLeave={release(button)}
    >
      {button}
    </button>
  );

  return (
    <div data-testid="gba-controller">
      <div>{DPAD.map(renderButton)}</div>
      <div>{FACE.map(renderButton)}</div>
      <div>{SYSTEM.map(renderButton)}</div>
      <div>{SHOULDER.map(renderButton)}</div>
    </div>
  );
}
