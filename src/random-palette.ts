import type { RGB } from './color';
import { oklchToRgb } from './color';

export type Brightness = 'bright' | 'normal' | 'muted';
export type HueMode = 'diverse' | 'complementary' | 'monotone';
export type PaletteSize = 8 | 16 | 32 | 64;

interface GenerateOptions {
  brightness: Brightness;
  hueMode: HueMode;
  size: PaletteSize;
}

// Chroma ranges per brightness level
const CHROMA_RANGE: Record<Brightness, [number, number]> = {
  bright: [0.14, 0.24],
  normal: [0.06, 0.16],
  muted: [0.02, 0.08],
};

// Lightness ranges per brightness level
const LIGHTNESS_RANGE: Record<Brightness, [number, number]> = {
  bright: [0.25, 0.95],
  normal: [0.15, 0.90],
  muted: [0.10, 0.75],
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate hue anchors based on hue mode.
 * Returns base hue values that color slots will be distributed around.
 */
function generateHueAnchors(mode: HueMode, count: number): number[] {
  const hues: number[] = [];

  switch (mode) {
    case 'diverse': {
      // Evenly distribute across 360° with small jitter
      const step = 360 / count;
      const offset = Math.random() * 360;
      for (let i = 0; i < count; i++) {
        hues.push((offset + i * step + rand(-step * 0.2, step * 0.2) + 360) % 360);
      }
      break;
    }
    case 'complementary': {
      // Two opposite hue anchors, distribute colors between them
      const baseHue = Math.random() * 360;
      const oppositeHue = (baseHue + 180) % 360;
      const spread = 30; // ±30° around each anchor
      for (let i = 0; i < count; i++) {
        const anchor = i % 2 === 0 ? baseHue : oppositeHue;
        hues.push((anchor + rand(-spread, spread) + 360) % 360);
      }
      break;
    }
    case 'monotone': {
      // Narrow hue range (±20° from a single anchor)
      const baseHue = Math.random() * 360;
      const spread = 20;
      for (let i = 0; i < count; i++) {
        hues.push((baseHue + rand(-spread, spread) + 360) % 360);
      }
      break;
    }
  }

  return hues;
}

/**
 * Check minimum distance in OKLCH space between a candidate and existing colors.
 * Uses weighted Euclidean distance on L, C, H (hue as angular distance).
 */
function minDistance(
  candidate: { l: number; c: number; h: number },
  existing: { l: number; c: number; h: number }[],
): number {
  let minDist = Infinity;
  for (const e of existing) {
    const dl = candidate.l - e.l;
    const dc = candidate.c - e.c;
    let dh = Math.abs(candidate.h - e.h) / 180;
    if (dh > 1) dh = 2 - dh;
    const dist = Math.sqrt(dl * dl + dc * dc + dh * dh);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Generate a random palette in OKLCH space with minimum-distance guarantees.
 */
export function generateRandomPalette(options: GenerateOptions): RGB[] {
  const { brightness, hueMode, size } = options;
  const [cMin, cMax] = CHROMA_RANGE[brightness];
  const [lMin, lMax] = LIGHTNESS_RANGE[brightness];

  const hueAnchors = generateHueAnchors(hueMode, size);

  // Include some near-achromatic colors for palette variety
  const achromaticCount = Math.max(1, Math.floor(size * 0.15));
  const chromaticCount = size - achromaticCount;

  const selected: { l: number; c: number; h: number }[] = [];
  const MAX_ATTEMPTS = 500;

  // Pre-assign evenly spaced lightness slots for chromatic colors, then jitter
  const lSlots: number[] = [];
  for (let i = 0; i < chromaticCount; i++) {
    const base = lMin + (lMax - lMin) * (i / (chromaticCount - 1 || 1));
    lSlots.push(base);
  }
  // Shuffle so hue anchors don't always pair with the same lightness
  for (let i = lSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lSlots[i], lSlots[j]] = [lSlots[j], lSlots[i]];
  }

  // Generate chromatic colors with best-candidate selection
  for (let i = 0; i < chromaticCount; i++) {
    let bestCandidate = { l: 0, c: 0, h: 0 };
    let bestDist = -1;

    // Wide jitter — full range allowed, slot is just a starting bias
    const lJitter = (lMax - lMin) * 0.4;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const l = Math.max(lMin, Math.min(lMax, lSlots[i] + rand(-lJitter, lJitter)));
      const c = rand(cMin, cMax);
      const h = hueAnchors[i % hueAnchors.length];

      const candidate = { l, c, h };

      if (selected.length === 0) {
        bestCandidate = candidate;
        break;
      }

      const dist = minDistance(candidate, selected);
      if (dist > bestDist) {
        bestDist = dist;
        bestCandidate = candidate;
      }
    }

    selected.push(bestCandidate);
  }

  // Generate achromatic / low-chroma colors spread across full lightness range
  for (let i = 0; i < achromaticCount; i++) {
    const l = lMin + (lMax - lMin) * ((i + 0.5) / achromaticCount);
    const c = rand(0, cMin * 0.3);
    const h = Math.random() * 360;
    selected.push({ l, c, h });
  }

  // Order by nearest-neighbor chain, starting from darkest color
  const ordered: typeof selected = [];
  const remaining = [...selected];

  // Start with the darkest color (lowest L)
  let startIdx = 0;
  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i].l < remaining[startIdx].l) startIdx = i;
  }
  ordered.push(remaining.splice(startIdx, 1)[0]);

  // Greedily pick the closest remaining color each step
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = minDistance(last, [remaining[i]]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered.map((oklch) => oklchToRgb(oklch));
}
