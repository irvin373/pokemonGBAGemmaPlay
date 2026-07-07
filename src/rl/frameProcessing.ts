import type { EmulatorCore } from '../emulator/types';

const HASH_GRID_SIZE = 8;

/**
 * Draws the emulator's current frame into an offscreen canvas and returns a
 * downsampled grayscale pixel buffer (research.md #3). Goes through the
 * existing captureFrameAsPngBase64() rather than reaching into EmulatorCore's
 * internals, so this stays a thin wrapper the same way contextCapture.ts does
 * for the LLM controller.
 */
export async function captureDownsampledFrame(
  core: EmulatorCore,
  size = 32,
): Promise<Uint8Array> {
  const base64Png = core.captureFrameAsPngBase64();
  const image = new Image();
  image.src = `data:image/png;base64,${base64Png}`;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for frame downsampling.');
  ctx.drawImage(image, 0, 0, size, size);

  const { data } = ctx.getImageData(0, 0, size, size);
  const gray = new Uint8Array(size * size);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
  }
  return gray;
}

/**
 * Average hash (aHash) over a grayscale pixel buffer (research.md #3): pools
 * down to an 8x8 grid, thresholds each cell against the grid mean, and packs
 * the 64 bits into a hex string. Pure/no-DOM so it's unit-testable directly
 * on raw pixel arrays.
 */
export function computeAverageHash(pixels: Uint8Array, width: number, height: number): string {
  if (width % HASH_GRID_SIZE !== 0 || height % HASH_GRID_SIZE !== 0) {
    throw new Error(
      `computeAverageHash requires dimensions divisible by ${HASH_GRID_SIZE} (got ${width}x${height}).`,
    );
  }

  const blockWidth = width / HASH_GRID_SIZE;
  const blockHeight = height / HASH_GRID_SIZE;
  const cells = new Float64Array(HASH_GRID_SIZE * HASH_GRID_SIZE);

  for (let gy = 0; gy < HASH_GRID_SIZE; gy++) {
    for (let gx = 0; gx < HASH_GRID_SIZE; gx++) {
      let sum = 0;
      for (let y = 0; y < blockHeight; y++) {
        for (let x = 0; x < blockWidth; x++) {
          const px = gx * blockWidth + x;
          const py = gy * blockHeight + y;
          sum += pixels[py * width + px];
        }
      }
      cells[gy * HASH_GRID_SIZE + gx] = sum / (blockWidth * blockHeight);
    }
  }

  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;

  let hash = 0n;
  for (let i = 0; i < cells.length; i++) {
    hash <<= 1n;
    if (cells[i] >= mean) hash |= 1n;
  }
  return hash.toString(16).padStart(16, '0');
}
