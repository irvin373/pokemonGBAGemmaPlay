import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Covers specs/002-rl-autoplay-training/quickstart.md Scenarios 1-2. Requires
 * a user-supplied FireRed ROM at the path in E2E_ROM_PATH (the project cannot
 * bundle/distribute one, FR-001) and a WebGL/WebGPU-capable browser for
 * reasonable training speed. Skipped when the prerequisite isn't present
 * rather than failing, same pattern as tests/e2e/gba-emulator.spec.ts.
 */
const romPath = process.env.E2E_ROM_PATH;
const hasRom = !!romPath && fs.existsSync(romPath);

test.describe('In-Browser RL Autoplay Training', () => {
  test.skip(!hasRom, 'Set E2E_ROM_PATH to a legally-owned FireRed ROM to run this suite.');

  test('starts training, shows live metrics, pauses, resumes, and resets (US1)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));

    await page.getByRole('button', { name: 'Start Training' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('rl-metrics-view')).toBeVisible();

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('button', { name: 'Start Training' })).toBeVisible();
    await expect(page.getByTestId('rl-metric-episode')).toHaveText('0');
  });

  test('saves a policy and runs it as an inference controller (US2)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));

    await page.getByRole('button', { name: 'Start Training' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Policy name').fill('e2e-policy');
    await page.getByRole('button', { name: 'Save Policy' }).click();
    await expect(page.getByRole('status')).toContainText('e2e-policy');

    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Run as Controller' }).first().click();

    await page.getByTestId('gba-button-A').dispatchEvent('pointerdown');
    await expect(page.getByRole('button', { name: 'Start Training' })).toBeVisible();
  });
});
