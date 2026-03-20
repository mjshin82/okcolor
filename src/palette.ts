import type { RGB, OKLCH } from './color';
import { rgbToOklch } from './color';

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
 * Map original image colors to a target palette using only exact target colors.
 *
 * Algorithm:
 * 1. Convert both palettes to OKLCH
 * 2. Sort each by hue, normalize hue to [0, 1] range based on rank
 * 3. For each original color, find the closest target color by normalized hue position
 * 4. Use the target color's exact RGB — no blending
 */
export function mapPaletteByHue(
  originalColors: RGB[],
  targetColors: RGB[],
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

  // Separate achromatic colors (very low chroma) from chromatic
  const CHROMA_THRESHOLD = 0.02;

  const origChromatic = origEntries.filter((e) => e.oklch.c >= CHROMA_THRESHOLD);
  const origAchromatic = origEntries.filter((e) => e.oklch.c < CHROMA_THRESHOLD);
  const targetChromatic = targetEntries.filter((e) => e.oklch.c >= CHROMA_THRESHOLD);
  const targetAchromatic = targetEntries.filter((e) => e.oklch.c < CHROMA_THRESHOLD);

  // Sort chromatic colors by hue and assign normalized positions
  origChromatic.sort((a, b) => a.oklch.h - b.oklch.h);
  targetChromatic.sort((a, b) => a.oklch.h - b.oklch.h);

  // Sort achromatic colors by lightness
  origAchromatic.sort((a, b) => a.oklch.l - b.oklch.l);
  targetAchromatic.sort((a, b) => a.oklch.l - b.oklch.l);

  // Map chromatic colors by normalized hue position → exact target RGB
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
      mapping.set(key, target.rgb);
    }
  }

  // Map achromatic colors by normalized lightness position → exact target RGB
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
      mapping.set(key, target.rgb);
    }
  } else if (targetChromatic.length > 0) {
    // No achromatic targets — map to closest-lightness chromatic target
    for (const orig of origAchromatic) {
      let bestIdx = 0;
      let bestDist = Math.abs(targetChromatic[0].oklch.l - orig.oklch.l);
      for (let ti = 1; ti < targetChromatic.length; ti++) {
        const dist = Math.abs(targetChromatic[ti].oklch.l - orig.oklch.l);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ti;
        }
      }
      const key = `${orig.rgb.r},${orig.rgb.g},${orig.rgb.b}`;
      mapping.set(key, targetChromatic[bestIdx].rgb);
    }
  }

  return mapping;
}
