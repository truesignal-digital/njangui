/**
 * Per-njangi visual identity — everything derives from ONE stored hue seed
 * (groups.colorSeed, rolled at creation) so every member sees the same
 * colors on every device. Groups created before the field exists fall back
 * to a hash of their id: still deterministic, still shared.
 *
 * Palette rule: two ANALOGOUS hues (seed, seed+35°) at low saturation —
 * subtle washes behind normal surfaces, never a background for body text.
 */

export function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 360;
  }
  return h;
}

export function resolveSeed(colorSeed: number | null, groupId: string): number {
  return colorSeed ?? seedFromId(groupId);
}

export type GradientStops = { start: string; end: string };

/** Soft card/header wash — sits UNDER surface content at full opacity. */
export function groupGradient(seed: number, dark: boolean): GradientStops {
  const h1 = seed % 360;
  const h2 = (seed + 35) % 360;
  return dark
    ? { start: `hsl(${h1}, 30%, 22%)`, end: `hsl(${h2}, 34%, 16%)` }
    : { start: `hsl(${h1}, 62%, 91%)`, end: `hsl(${h2}, 58%, 84%)` };
}

/** The one BOLD use — the avatar disc. White initials on top. */
export function groupAvatarGradient(seed: number, dark: boolean): GradientStops {
  const h1 = seed % 360;
  const h2 = (seed + 35) % 360;
  return dark
    ? { start: `hsl(${h1}, 45%, 42%)`, end: `hsl(${h2}, 50%, 32%)` }
    : { start: `hsl(${h1}, 55%, 52%)`, end: `hsl(${h2}, 60%, 42%)` };
}

/** Strong accent (progress ring, tints) readable on surface. */
export function groupAccent(seed: number, dark: boolean): string {
  return dark
    ? `hsl(${seed % 360}, 55%, 62%)`
    : `hsl(${seed % 360}, 55%, 40%)`;
}

/** Initials for the avatar disc: « Njangi Famille » → « NF ». */
export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '·';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
