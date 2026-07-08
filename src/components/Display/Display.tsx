import { useEffect, useRef } from 'react';
import type { EmulatorCore } from '../../emulator/types';

interface DisplayProps {
  core: EmulatorCore;
  onAttached?: () => void;
}

/** Renders the running game (FR-002). mGBA draws directly into this canvas. */
export function Display({ core, onAttached }: DisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const attachedRef = useRef(false);

  useEffect(() => {
    if (attachedRef.current || !canvasRef.current) return;
    attachedRef.current = true;
    core.attach(canvasRef.current).then(() => onAttached?.());
  }, [core, onAttached]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={160}
      data-testid="gba-display"
      className="gba-screen"
    />
  );
}
