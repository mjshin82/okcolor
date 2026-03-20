import type { RGB, OKLCH } from './color';
import { rgbToOklch, oklchToRgb } from './color';

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
 * Compute weighted score for color sorting/matching: L*0.5 + H*0.3 + C*0.2
 * L is already 0-1, H is normalized to 0-1, C is normalized to 0-1 (capped at 0.4)
 */
function colorScore(oklch: OKLCH): number {
  const normH = oklch.h / 360;
  const normC = Math.min(oklch.c / 0.4, 1);
  return oklch.l * 0.7 + normH * 0.2 + normC * 0.1;
}

/**
 * Map original image colors to a target palette using hue-based normalized matching.
 *
 * @param exactOnly - If true, match by weighted L/H/C score using only exact target RGB colors.
 *                    If false (default), blend lightness from original with target hue/chroma.
 */
export function mapPaletteByHue(
  originalColors: RGB[],
  targetColors: RGB[],
  exactOnly = false,
): Map<string, RGB> {
  const mapping = new Map<string, RGB>();

  const origEntries: OklchEntry[] = originalColors.map((rgb) => ({
    rgb,
    oklch: rgbToOklch(rgb),
  }));
  const targetEntries: OklchEntry[] = targetColors.map((rgb) => ({
    rgb,
    oklch: rgbToOklch(rgb),
  }));

  if (exactOnly) {
    // Exact mode: score-based matching, use only target palette RGB values
    const targetScores = targetEntries.map((e) => ({ ...e, score: colorScore(e.oklch) }));
    targetScores.sort((a, b) => a.score - b.score);

    const origScored = origEntries.map((e) => ({ ...e, score: colorScore(e.oklch) }));
    origScored.sort((a, b) => a.score - b.score);

    // Normalize scores to [0,1] within each group
    const origMin = origScored[0]?.score ?? 0;
    const origMax = origScored[origScored.length - 1]?.score ?? 1;
    const origRange = origMax - origMin || 1;

    const targetMin = targetScores[0]?.score ?? 0;
    const targetMax = targetScores[targetScores.length - 1]?.score ?? 1;
    const targetRange = targetMax - targetMin || 1;

    for (const orig of origScored) {
      const origNorm = (orig.score - origMin) / origRange;

      let bestIdx = 0;
      let bestDist = Infinity;
      for (let ti = 0; ti < targetScores.length; ti++) {
        const targetNorm = (targetScores[ti].score - targetMin) / targetRange;
        const dist = Math.abs(targetNorm - origNorm);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ti;
        }
      }

      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      mapping.set(key, targetScores[bestIdx].rgb);
    }

    return mapping;
  }

  // Default mode: hue-based matching with lightness blending
  const CHROMA_THRESHOLD = 0.02;

  const origChromatic = origEntries.filter((e) => e.oklch.c >= CHROMA_THRESHOLD);
  const origAchromatic = origEntries.filter((e) => e.oklch.c < CHROMA_THRESHOLD);
  const targetChromatic = targetEntries.filter((e) => e.oklch.c >= CHROMA_THRESHOLD);
  const targetAchromatic = targetEntries.filter((e) => e.oklch.c < CHROMA_THRESHOLD);

  origChromatic.sort((a, b) => a.oklch.h - b.oklch.h);
  targetChromatic.sort((a, b) => a.oklch.h - b.oklch.h);
  origAchromatic.sort((a, b) => a.oklch.l - b.oklch.l);
  targetAchromatic.sort((a, b) => a.oklch.l - b.oklch.l);

  if (targetChromatic.length > 0) {
    const targetNormHues = targetChromatic.map((_, i) =>
      targetChromatic.length === 1 ? 0.5 : i / (targetChromatic.length - 1),
    );

    for (let oi = 0; oi < origChromatic.length; oi++) {
      const origNorm =
        origChromatic.length === 1 ? 0.5 : oi / (origChromatic.length - 1);

      let bestIdx = 0;
      let bestDist = Math.abs(targetNormHues[0] - origNorm);
      for (let ti = 1; ti < targetNormHues.length; ti++) {
        const dist = Math.abs(targetNormHues[ti] - origNorm);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ti;
        }
      }

      const orig = origChromatic[oi];
      const target = targetChromatic[bestIdx];
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      const mapped: OKLCH = { l: orig.oklch.l, c: target.oklch.c, h: target.oklch.h };
      mapping.set(key, oklchToRgb(mapped));
    }
  }

  if (targetAchromatic.length > 0) {
    const targetNormLs = targetAchromatic.map((_, i) =>
      targetAchromatic.length === 1 ? 0.5 : i / (targetAchromatic.length - 1),
    );

    for (let oi = 0; oi < origAchromatic.length; oi++) {
      const origNorm =
        origAchromatic.length === 1 ? 0.5 : oi / (origAchromatic.length - 1);

      let bestIdx = 0;
      let bestDist = Math.abs(targetNormLs[0] - origNorm);
      for (let ti = 1; ti < targetNormLs.length; ti++) {
        const dist = Math.abs(targetNormLs[ti] - origNorm);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ti;
        }
      }

      const orig = origAchromatic[oi];
      const target = targetAchromatic[bestIdx];
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      const mapped: OKLCH = { l: orig.oklch.l, c: target.oklch.c, h: target.oklch.h };
      mapping.set(key, oklchToRgb(mapped));
    }
  } else if (targetChromatic.length > 0) {
    const darkest = targetChromatic.reduce((a, b) =>
      a.oklch.l < b.oklch.l ? a : b,
    );
    for (const orig of origAchromatic) {
      const mapped: OKLCH = { l: orig.oklch.l, c: darkest.oklch.c * 0.1, h: darkest.oklch.h };
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      mapping.set(key, oklchToRgb(mapped));
    }
  }

  return mapping;
}
