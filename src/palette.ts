import type { RGB, OKLCH } from './color';
import { rgbToOklch, oklchToRgb } from './color';

export type MappingMode = 'nearest' | 'diverse' | 'hueOnly';

export interface Palette {
  name: string;
  colors: RGB[];
}

export const PRESET_PALETTES = [
  { name: 'Resurrect 64', file: '/resurrect-64.pal', url: 'https://lospec.com/palette-list/resurrect-64' },
  { name: 'Endesga 32', file: '/endesga-32.pal', url: 'https://lospec.com/palette-list/endesga-32' },
  { name: 'Apollo', file: '/apollo.pal', url: 'https://lospec.com/palette-list/apollo' },
  { name: 'Lospec500', file: '/lospec500.pal', url: 'https://lospec.com/palette-list/lospec500' },
  { name: 'CC-29', file: '/cc-29.pal', url: 'https://lospec.com/palette-list/cc-29' },
  { name: 'Endesga 64', file: '/endesga-64.pal', url: 'https://lospec.com/palette-list/endesga-64' },
  { name: 'SLSO8', file: '/slso8.pal', url: 'https://lospec.com/palette-list/slso8' },
  { name: 'Oil 6', file: '/oil-6.pal', url: 'https://lospec.com/palette-list/oil-6' },
  { name: 'Steam Lords', file: '/steam-lords.pal', url: 'https://lospec.com/palette-list/steam-lords' },
  { name: 'Rust Gold 8', file: '/rust-gold-8.pal', url: 'https://lospec.com/palette-list/rust-gold-8' },
  { name: 'CL8UDS', file: '/cl8uds.pal', url: 'https://lospec.com/palette-list/cl8uds' },
  { name: 'JustParchment8', file: '/justparchment8.pal', url: 'https://lospec.com/palette-list/justparchment8' },
  { name: 'Berry Nebula', file: '/berry-nebula.pal', url: 'https://lospec.com/palette-list/berry-nebula' },
] as const;

export function parseJascPal(text: string): RGB[] {
  const lines = text.trim().split(/\r?\n/);
  // JASC-PAL header: line 0 = "JASC-PAL", line 1 = "0100", line 2 = count
  const colors: RGB[] = [];
  for (let i = 3; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 3) {
      colors.push({
        r: parseInt(parts[0], 10),
        g: parseInt(parts[1], 10),
        b: parseInt(parts[2], 10),
      });
    }
  }
  return colors;
}

export async function loadPalFile(url: string): Promise<RGB[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load palette: ${url}`);
  const text = await res.text();
  return parseJascPal(text);
}

interface OklchEntry {
  rgb: RGB;
  oklch: OKLCH;
}

/**
 * Compute perceptual distance between two OKLCH colors.
 * Uses angular hue distance for correct wrap-around at 0°/360°.
 */
function oklchDistance(a: OKLCH, b: OKLCH): number {
  const dL = a.l - b.l;
  const dC = a.c - b.c;
  let dH = Math.abs(a.h - b.h);
  if (dH > 180) dH = 360 - dH;
  // Normalize hue difference to comparable scale (0-1 range like L)
  const normDH = dH / 180;
  return Math.sqrt(dL * dL + dC * dC + normDH * normDH);
}

/**
 * Map original image colors to a target palette.
 *
 * Modes:
 * - 'nearest': find closest target by OKLCH distance, use exact target RGB
 * - 'diverse': spread colors evenly across target palette
 * - 'hueOnly': find closest target, apply its hue but keep original L and C
 */
export function mapPaletteByHue(
  originalColors: RGB[],
  targetColors: RGB[],
  mode: MappingMode = 'nearest',
): Map<string, RGB> {
  const origEntries: OklchEntry[] = originalColors.map((rgb) => ({
    rgb,
    oklch: rgbToOklch(rgb),
  }));
  const targetEntries: OklchEntry[] = targetColors.map((rgb) => ({
    rgb,
    oklch: rgbToOklch(rgb),
  }));

  if (mode === 'hueOnly') {
    const mapping = new Map<string, RGB>();
    // Find closest target by hue distance only
    for (const orig of origEntries) {
      let bestIdx = 0;
      let bestHueDist = Infinity;
      for (let ti = 0; ti < targetEntries.length; ti++) {
        let dh = Math.abs(orig.oklch.h - targetEntries[ti].oklch.h);
        if (dh > 180) dh = 360 - dh;
        if (dh < bestHueDist) {
          bestHueDist = dh;
          bestIdx = ti;
        }
      }
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      const mapped: OKLCH = {
        l: orig.oklch.l,
        c: orig.oklch.c,
        h: targetEntries[bestIdx].oklch.h,
      };
      mapping.set(key, oklchToRgb(mapped));
    }
    return mapping;
  }

  if (mode === 'nearest') {
    const mapping = new Map<string, RGB>();
    for (const orig of origEntries) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let ti = 0; ti < targetEntries.length; ti++) {
        const dist = oklchDistance(orig.oklch, targetEntries[ti].oklch);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ti;
        }
      }
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      mapping.set(key, targetEntries[bestIdx].rgb);
    }
    return mapping;
  }

  // Diverse mapping: build score table, assign greedily, penalize overused targets
  const oLen = origEntries.length;
  const tLen = targetEntries.length;

  // Build 2D score table (higher = closer)
  const scores: number[][] = [];
  for (let oi = 0; oi < oLen; oi++) {
    scores[oi] = [];
    for (let ti = 0; ti < tLen; ti++) {
      const dist = oklchDistance(origEntries[oi].oklch, targetEntries[ti].oklch);
      // Invert distance to score: closer = higher score
      scores[oi][ti] = 1 / (1 + dist);
    }
  }

  const assignment = new Array<number>(oLen).fill(-1);
  const targetUsage = new Array<number>(tLen).fill(0);
  const assigned = new Set<number>();

  const MAX_ROUNDS = 100;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Find the highest score among unassigned originals
    let bestOi = -1;
    let bestTi = -1;
    let bestScore = -Infinity;

    for (let oi = 0; oi < oLen; oi++) {
      if (assigned.has(oi)) continue;
      for (let ti = 0; ti < tLen; ti++) {
        if (scores[oi][ti] > bestScore) {
          bestScore = scores[oi][ti];
          bestOi = oi;
          bestTi = ti;
        }
      }
    }

    if (bestOi === -1) break; // all assigned

    // Check if this target is overused (+1 above min usage)
    const minUsage = Math.min(...targetUsage);
    if (targetUsage[bestTi] >= minUsage + 1) {
      // Penalize this score by 10% and retry
      scores[bestOi][bestTi] *= 0.95;
      continue;
    }

    // Assign
    assignment[bestOi] = bestTi;
    targetUsage[bestTi]++;
    assigned.add(bestOi);

    if (assigned.size === oLen) break;
  }

  // Fallback: assign any remaining by simple nearest
  for (let oi = 0; oi < oLen; oi++) {
    if (assignment[oi] !== -1) continue;
    let bestTi = 0;
    let bestScore = -Infinity;
    for (let ti = 0; ti < tLen; ti++) {
      if (scores[oi][ti] > bestScore) {
        bestScore = scores[oi][ti];
        bestTi = ti;
      }
    }
    assignment[oi] = bestTi;
  }

  const mapping = new Map<string, RGB>();
  for (let oi = 0; oi < oLen; oi++) {
    const key = `${origEntries[oi].rgb.r},${origEntries[oi].rgb.g},${origEntries[oi].rgb.b}`;
    mapping.set(key, targetEntries[assignment[oi]].rgb);
  }
  return mapping;
}
