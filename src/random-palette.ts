import type { RGB } from './color';
import { oklchToRgb } from './color';

export type Brightness = 'bright' | 'normal' | 'muted';
export type HueMode = 'complementary' | 'analogous' | 'triadic' | 'splitComplementary' | 'tetradic' | 'monochromatic';
export type PaletteSize = 8 | 16 | 32 | 64;

interface GenerateOptions {
  brightness: Brightness;
  hueMode: HueMode;
  size: PaletteSize;
}

const CHROMA_RANGE: Record<Brightness, [number, number]> = {
  bright: [0.14, 0.24],
  normal: [0.06, 0.16],
  muted: [0.02, 0.08],
};

const LIGHTNESS_RANGE: Record<Brightness, [number, number]> = {
  bright: [0.25, 0.95],
  normal: [0.15, 0.90],
  muted: [0.10, 0.75],
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate hue anchors based on color harmony mode.
 * Each mode picks key hues, then distributes `count` colors around them with spread.
 */
function generateHueAnchors(mode: HueMode, count: number): number[] {
  const baseHue = Math.random() * 360;
  let keyHues: number[];
  let spread: number;

  switch (mode) {
    case 'complementary':
      // Two opposite hues
      keyHues = [baseHue, (baseHue + 180) % 360];
      spread = 25;
      break;
    case 'analogous':
      // One region, 60° range
      keyHues = [baseHue];
      spread = 30;
      break;
    case 'triadic':
      // Three hues at 120° intervals
      keyHues = [baseHue, (baseHue + 120) % 360, (baseHue + 240) % 360];
      spread = 20;
      break;
    case 'splitComplementary':
      // Base + two flanking the complement (±30° from 180°)
      keyHues = [baseHue, (baseHue + 150) % 360, (baseHue + 210) % 360];
      spread = 20;
      break;
    case 'tetradic':
      // Four hues at 90° intervals
      keyHues = [baseHue, (baseHue + 90) % 360, (baseHue + 180) % 360, (baseHue + 270) % 360];
      spread = 15;
      break;
    case 'monochromatic':
      // Single hue, very narrow range
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
  const { brightness, hueMode, size } = options;
  const [cMin, cMax] = CHROMA_RANGE[brightness];
  const [lMin, lMax] = LIGHTNESS_RANGE[brightness];

  const hueAnchors = generateHueAnchors(hueMode, size);

  const achromaticCount = Math.max(1, Math.floor(size * 0.15));
  const chromaticCount = size - achromaticCount;

  const selected: { l: number; c: number; h: number }[] = [];
  const MAX_ATTEMPTS = 500;

  // Pre-assign evenly spaced lightness slots, shuffled
  const lSlots: number[] = [];
  for (let i = 0; i < chromaticCount; i++) {
    const base = lMin + (lMax - lMin) * (i / (chromaticCount - 1 || 1));
    lSlots.push(base);
  }
  for (let i = lSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lSlots[i], lSlots[j]] = [lSlots[j], lSlots[i]];
  }

  // Generate chromatic colors with best-candidate selection
  for (let i = 0; i < chromaticCount; i++) {
    let bestCandidate = { l: 0, c: 0, h: 0 };
    let bestDist = -1;
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

  // Generate achromatic / low-chroma colors
  for (let i = 0; i < achromaticCount; i++) {
    const l = lMin + (lMax - lMin) * ((i + 0.5) / achromaticCount);
    const c = rand(0, cMin * 0.3);
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
