import type { RGB } from './color';
import { oklchToRgb } from './color';

export type ValueMode = 'highContrast' | 'lowContrast' | 'valueScale' | 'rule603010';
export type HueMode = 'complementary' | 'analogous' | 'triadic' | 'splitComplementary' | 'tetradic' | 'monochromatic';
export type SaturationMode = 'vividMuted' | 'satScale' | 'uniform' | 'allLow' | 'allHigh' | 'chaotic';
export type PaletteSize = 8 | 16 | 32 | 64;

interface GenerateOptions {
  valueMode: ValueMode;
  hueMode: HueMode;
  saturationMode: SaturationMode;
  size: PaletteSize;
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
    case 'vividMuted': {
      // 25% high chroma accent, 75% low chroma background
      const accentCount = Math.max(1, Math.round(count * 0.25));
      const bgCount = count - accentCount;
      for (let i = 0; i < accentCount; i++) {
        slots.push(rand(0.15, 0.25));
      }
      for (let i = 0; i < bgCount; i++) {
        slots.push(rand(0.02, 0.08));
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
    case 'uniform': {
      // One chroma level dominates
      const level = rand(0.06, 0.18);
      for (let i = 0; i < count; i++) {
        slots.push(Math.max(0.01, level + rand(-0.03, 0.03)));
      }
      break;
    }
    case 'allLow': {
      // All low chroma — vintage, muted
      for (let i = 0; i < count; i++) {
        slots.push(rand(0.01, 0.06));
      }
      break;
    }
    case 'allHigh': {
      // All high chroma — vivid
      for (let i = 0; i < count; i++) {
        slots.push(rand(0.14, 0.26));
      }
      break;
    }
    case 'chaotic': {
      // Random chroma with big jumps
      for (let i = 0; i < count; i++) {
        slots.push(rand(0.01, 0.26));
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
 * Generate hue anchors based on color harmony mode.
 */
function generateHueAnchors(mode: HueMode, count: number): number[] {
  const baseHue = Math.random() * 360;
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

export function generateRandomPalette(options: GenerateOptions): RGB[] {
  const { valueMode, hueMode, saturationMode, size } = options;

  const hueAnchors = generateHueAnchors(hueMode, size);
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

  return ordered.map((oklch) => oklchToRgb(oklch));
}
