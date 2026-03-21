import type { RGB } from './color';
import { oklchToRgb, rgbToOklch } from './color';

export type ValueMode = 'highContrast' | 'lowContrast' | 'valueScale' | 'rule603010';
export type HueMode = 'complementary' | 'analogous' | 'triadic' | 'splitComplementary' | 'tetradic' | 'monochromatic';
export type SaturationMode = 'sat603010' | 'satHighContrast' | 'satLowContrast' | 'satScale';
export type PaletteSize = 8 | 16 | 32 | 64;

interface GenerateOptions {
  valueMode: ValueMode;
  hueMode: HueMode;
  saturationMode: SaturationMode;
  size: PaletteSize;
  imageData?: ImageData;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate lightness slots based on value mode.
 */
function generateLightnessSlots(mode: ValueMode, count: number): number[] {
  const slots: number[] = [];

  switch (mode) {
    case 'highContrast': {
      // 50/50 dark and light, strong separation
      const darkCount = Math.ceil(count / 2);
      const lightCount = count - darkCount;
      for (let i = 0; i < darkCount; i++) {
        slots.push(rand(0.10, 0.35));
      }
      for (let i = 0; i < lightCount; i++) {
        slots.push(rand(0.70, 0.95));
      }
      break;
    }
    case 'lowContrast': {
      // Clustered around mid-range lightness
      const center = rand(0.40, 0.60);
      const spread = 0.12;
      for (let i = 0; i < count; i++) {
        slots.push(Math.max(0.15, Math.min(0.85, center + rand(-spread, spread))));
      }
      break;
    }
    case 'valueScale': {
      // Evenly distributed from dark to light
      for (let i = 0; i < count; i++) {
        const base = 0.10 + (0.90 - 0.10) * (i / (count - 1 || 1));
        slots.push(base + rand(-0.03, 0.03));
      }
      break;
    }
    case 'rule603010': {
      // 60% light (dominant), 30% mid (secondary), 10% dark (accent)
      const lightCount = Math.max(1, Math.round(count * 0.6));
      const midCount = Math.max(1, Math.round(count * 0.3));
      const darkCount = Math.max(1, count - lightCount - midCount);
      for (let i = 0; i < lightCount; i++) {
        slots.push(rand(0.65, 0.92));
      }
      for (let i = 0; i < midCount; i++) {
        slots.push(rand(0.35, 0.60));
      }
      for (let i = 0; i < darkCount; i++) {
        slots.push(rand(0.10, 0.30));
      }
      break;
    }
  }

  // Shuffle so hue anchors don't always pair with the same lightness
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return slots;
}

/**
 * Generate chroma slots based on saturation mode.
 */
function generateChromaSlots(mode: SaturationMode, count: number): number[] {
  const slots: number[] = [];

  switch (mode) {
    case 'sat603010': {
      // 60% low chroma, 30% mid chroma, 10% high chroma
      const lowCount = Math.max(1, Math.round(count * 0.6));
      const midCount = Math.max(1, Math.round(count * 0.3));
      const highCount = Math.max(1, count - lowCount - midCount);
      for (let i = 0; i < lowCount; i++) {
        slots.push(rand(0.01, 0.06));
      }
      for (let i = 0; i < midCount; i++) {
        slots.push(rand(0.07, 0.14));
      }
      for (let i = 0; i < highCount; i++) {
        slots.push(rand(0.15, 0.26));
      }
      break;
    }
    case 'satHighContrast': {
      // Random chroma with big jumps — high contrast
      for (let i = 0; i < count; i++) {
        slots.push(rand(0.01, 0.26));
      }
      break;
    }
    case 'satLowContrast': {
      // One chroma level dominates — low contrast
      const level = rand(0.06, 0.18);
      for (let i = 0; i < count; i++) {
        slots.push(Math.max(0.01, level + rand(-0.03, 0.03)));
      }
      break;
    }
    case 'satScale': {
      // Even distribution from low to high chroma
      for (let i = 0; i < count; i++) {
        const base = 0.02 + (0.24 - 0.02) * (i / (count - 1 || 1));
        slots.push(base + rand(-0.01, 0.01));
      }
      break;
    }
  }

  // Shuffle
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return slots;
}

/**
 * Find the dominant hue from image pixel data.
 * Divides hue into 60 buckets, scores each pixel's bucket (+2 self, +1 neighbors).
 * Excludes very dark (L < 0.15) and very bright (L > 0.90) pixels.
 */
function findDominantHue(imageData: ImageData): number {
  const BUCKETS = 60;
  const scores = new Array(BUCKETS).fill(0);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const rgb: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const oklch = rgbToOklch(rgb);

    // Skip near-black and near-white
    if (oklch.l < 0.15 || oklch.l > 0.90) continue;
    // Skip achromatic
    if (oklch.c < 0.02) continue;

    const normH = oklch.h / 360; // 0-1
    const idx = Math.floor(normH * BUCKETS) % BUCKETS;

    scores[idx] += 2;
    scores[(idx - 1 + BUCKETS) % BUCKETS] += 1;
    scores[(idx + 1) % BUCKETS] += 1;
  }

  // Find bucket with highest score
  let bestIdx = 0;
  for (let i = 1; i < BUCKETS; i++) {
    if (scores[i] > scores[bestIdx]) bestIdx = i;
  }

  // Convert bucket center back to hue degrees
  return (bestIdx + 0.5) / BUCKETS * 360;
}

/**
 * Generate hue anchors based on color harmony mode.
 */
function generateHueAnchors(mode: HueMode, count: number, baseHue: number): number[] {
  let keyHues: number[];
  let spread: number;

  switch (mode) {
    case 'complementary':
      keyHues = [baseHue, (baseHue + 180) % 360];
      spread = 25;
      break;
    case 'analogous':
      keyHues = [baseHue];
      spread = 30;
      break;
    case 'triadic':
      keyHues = [baseHue, (baseHue + 120) % 360, (baseHue + 240) % 360];
      spread = 20;
      break;
    case 'splitComplementary':
      keyHues = [baseHue, (baseHue + 150) % 360, (baseHue + 210) % 360];
      spread = 20;
      break;
    case 'tetradic':
      keyHues = [baseHue, (baseHue + 90) % 360, (baseHue + 180) % 360, (baseHue + 270) % 360];
      spread = 15;
      break;
    case 'monochromatic':
      keyHues = [baseHue];
      spread = 15;
      break;
  }

  const hues: number[] = [];
  for (let i = 0; i < count; i++) {
    const anchor = keyHues[i % keyHues.length];
    hues.push((anchor + rand(-spread, spread) + 360) % 360);
  }
  return hues;
}

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

export interface GenerateResult {
  /** Colors with hue offset applied — for palette preview display */
  displayColors: RGB[];
  /** Colors without hue offset — for image mapping */
  mappingColors: RGB[];
  /** The random hue offset that was applied */
  hueOffset: number;
}

export function generateRandomPalette(options: GenerateOptions): GenerateResult {
  const { valueMode, hueMode, saturationMode, size, imageData } = options;

  // Determine base hue from image analysis, fallback to random
  let baseHue: number;
  if (imageData) {
    baseHue = findDominantHue(imageData);
  } else {
    baseHue = Math.random() * 360;
  }

  // Random hue offset for variety (±60°), stored separately
  const randomHueOffset = rand(-60, 60);

  // Generate anchors WITHOUT the offset (for mapping)
  const hueAnchors = generateHueAnchors(hueMode, size, baseHue);
  const lSlots = generateLightnessSlots(valueMode, size);
  const cSlots = generateChromaSlots(saturationMode, size);

  const achromaticCount = Math.max(1, Math.floor(size * 0.15));
  const chromaticCount = size - achromaticCount;

  const selected: { l: number; c: number; h: number }[] = [];
  const MAX_ATTEMPTS = 500;

  // Generate chromatic colors with best-candidate selection
  for (let i = 0; i < chromaticCount; i++) {
    let bestCandidate = { l: 0, c: 0, h: 0 };
    let bestDist = -1;
    const lJitter = 0.08;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const l = Math.max(0.05, Math.min(0.98, lSlots[i] + rand(-lJitter, lJitter)));
      const c = Math.max(0.01, cSlots[i] + rand(-0.02, 0.02));
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

  // Generate achromatic / low-chroma colors spread across lightness
  const achroLSlots = generateLightnessSlots(valueMode, achromaticCount);
  for (let i = 0; i < achromaticCount; i++) {
    const l = achroLSlots[i];
    const c = rand(0, 0.015);
    const h = Math.random() * 360;
    selected.push({ l, c, h });
  }

  // Order by nearest-neighbor chain, starting from darkest
  const ordered: typeof selected = [];
  const remaining = [...selected];

  let startIdx = 0;
  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i].l < remaining[startIdx].l) startIdx = i;
  }
  ordered.push(remaining.splice(startIdx, 1)[0]);

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

  // Mapping colors: no hue offset
  const mappingColors = ordered.map((oklch) => oklchToRgb(oklch));

  // Display colors: with hue offset applied
  const displayColors = ordered.map((oklch) => oklchToRgb({
    l: oklch.l,
    c: oklch.c,
    h: (oklch.h + randomHueOffset + 360) % 360,
  }));

  return { displayColors, mappingColors, hueOffset: randomHueOffset };
}
