import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Covers quickstart.md Scenarios 1-3. Requires a user-supplied FireRed ROM at the
 * path in E2E_ROM_PATH (the project cannot bundle/distribute one, FR-001) and,
 * for the autoplay scenario, a local Ollama instance with a vision-capable model.
 * Scenarios are skipped when their prerequisite isn't present rather than failing.
 */
const romPath = process.env.E2E_ROM_PATH;
const hasRom = !!romPath && fs.existsSync(romPath);

test.describe('Browser GBA Emulator', () => {
  test.skip(!hasRom, 'Set E2E_ROM_PATH to a legally-owned FireRed ROM to run this suite.');

  test('loads a ROM and renders the display (US1)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));
    await expect(page.getByTestId('gba-display')).toBeVisible();
    await expect(page.getByTestId('session-error')).toHaveCount(0);
  });

  test('saves and reloads a save state (US2)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));

    await page.getByLabel('Save state label').fill('e2e-checkpoint');
    await page.getByRole('button', { name: 'Save State' }).click();
    await expect(page.getByRole('status')).toContainText('e2e-checkpoint');

    await page.reload();
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));
    await page.getByRole('button', { name: 'Load' }).first().click();
  });

  test('enables AI autoplay and allows manual take-over (US3)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#rom-file-input', path.resolve(romPath!));

    await page.getByRole('button', { name: 'Enable Autoplay' }).click();
    await expect(page.getByRole('button', { name: 'Take Over' })).toBeVisible();

    await page.getByTestId('gba-button-A').dispatchEvent('pointerdown');
    await expect(page.getByRole('button', { name: 'Enable Autoplay' })).toBeVisible();
  });
});
