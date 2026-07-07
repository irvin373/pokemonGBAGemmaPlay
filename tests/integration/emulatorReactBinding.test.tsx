import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Display } from '../../src/components/Display/Display';
import { Controller } from '../../src/components/Controller/Controller';
import type { EmulatorCore } from '../../src/emulator/types';

function makeCore(): EmulatorCore {
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    loadRom: vi.fn(),
    pressButton: vi.fn(),
    releaseButton: vi.fn(),
    saveState: vi.fn(),
    loadState: vi.fn(),
    captureFrameAsPngBase64: vi.fn(),
    setTrainingSpeed: vi.fn(),
    restoreNormalSpeed: vi.fn(),
  };
}

describe('Display <-> EmulatorCore binding', () => {
  it('attaches the core to its canvas on mount (FR-002)', async () => {
    const core = makeCore();
    render(<Display core={core} />);

    expect(core.attach).toHaveBeenCalledTimes(1);
    expect(core.attach).toHaveBeenCalledWith(expect.any(HTMLCanvasElement));
  });
});

describe('Controller <-> EmulatorCore binding', () => {
  it('presses and releases the corresponding button on pointer down/up (FR-003)', () => {
    const core = makeCore();
    const onManualInput = vi.fn();
    render(<Controller core={core} onManualInput={onManualInput} />);

    const buttonA = screen.getByTestId('gba-button-A');
    buttonA.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(core.pressButton).toHaveBeenCalledWith('A');
    expect(onManualInput).toHaveBeenCalled();

    buttonA.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(core.releaseButton).toHaveBeenCalledWith('A');
  });
});
