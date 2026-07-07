# Contract: EmulatorCore Extension (RL training speed control)

Addendum to feature 001's `specs/001-browser-gba-emulator/contracts/emulator-core-interface.md`.
Adds two methods to the existing `EmulatorCore` interface
(`src/emulator/types.ts`) implemented by `MgbaEmulatorCore`
(`src/emulator/core.ts`).

```ts
interface EmulatorCore {
  // ...existing feature 001 methods unchanged...

  /** Accelerates emulation for training throughput (FR-003). */
  setTrainingSpeed(multiplier: number, frameSkip: number): void;

  /** Restores the speed/settings that were active before setTrainingSpeed
   *  was first called. Idempotent — safe to call even if never accelerated. */
  restoreNormalSpeed(): void;
}
```

**Contract rules**:
- `setTrainingSpeed` MUST call the real mGBA module's
  `setFastForwardMultiplier(multiplier)` and
  `setCoreSettings({ frameSkip, rewindEnable: false, autoSaveStateEnable: false })`
  (both already-typed methods on `MgbaModule`, confirmed present in
  `node_modules/@thenick775/mgba-wasm/dist/mgba.d.ts` — no new emulator
  dependency).
- Before the *first* `setTrainingSpeed` call in the core's lifetime, the
  implementation MUST snapshot the then-current fast-forward multiplier and
  core settings, so `restoreNormalSpeed()` returns to the true pre-training
  state rather than a hardcoded default — repeated pause/resume/pause cycles
  MUST be idempotent (no drift).
- `restoreNormalSpeed()` MUST be synchronous (a direct WASM call, not an
  async round trip) so pausing satisfies spec SC-004 (<2s return to manual
  play) — in practice this call alone should complete in well under 100ms.
- Both methods are no-ops with respect to `pressButton`/`releaseButton` and
  `captureFrameAsPngBase64` — they only affect emulation speed/frame-skip,
  never input routing.
