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

type CollectiveColor = {
  wash: GradientStops;
  avatar: GradientStops;
  accent: string;
  tint: string;
  solid: string;
};

const COLLECTIVE_LIGHT: CollectiveColor[] = [
  { wash: { start: '#E6EFE2', end: '#D6E4D3' }, avatar: { start: '#9BB69B', end: '#6F9374' }, accent: '#456B4E', tint: '#E2ECDF', solid: '#567B5D' },
  { wash: { start: '#F1E7EE', end: '#E8D8E3' }, avatar: { start: '#A9859F', end: '#7B536E' }, accent: '#6D3F60', tint: '#EFE3EB', solid: '#744765' },
  { wash: { start: '#F4ECD7', end: '#EADCB8' }, avatar: { start: '#D3B36E', end: '#B3873D' }, accent: '#8A672F', tint: '#F4EACF', solid: '#927038' },
  { wash: { start: '#F5E3DC', end: '#EDD2C7' }, avatar: { start: '#D8957D', end: '#B8644D' }, accent: '#A9533F', tint: '#F5DED5', solid: '#A95743' },
  { wash: { start: '#E3ECE7', end: '#D5E2DC' }, avatar: { start: '#91AAA0', end: '#607D72' }, accent: '#465F56', tint: '#E0E9E3', solid: '#537066' },
  { wash: { start: '#ECEEDC', end: '#DFE3C8' }, avatar: { start: '#AFB78B', end: '#7E895B' }, accent: '#647044', tint: '#E9ECD8', solid: '#6D774C' },
];

const COLLECTIVE_DARK: CollectiveColor[] = [
  { wash: { start: '#24382A', end: '#1D3023' }, avatar: { start: '#86AA8A', end: '#557C5D' }, accent: '#B6D4B6', tint: '#243B2B', solid: '#6F9B76' },
  { wash: { start: '#3E2837', end: '#31212B' }, avatar: { start: '#C49AB8', end: '#936A87' }, accent: '#D3A7C4', tint: '#3E2837', solid: '#9F728F' },
  { wash: { start: '#3C3220', end: '#312819' }, avatar: { start: '#D8B96F', end: '#AD8746' }, accent: '#E6C978', tint: '#3D321D', solid: '#AE8948' },
  { wash: { start: '#442A23', end: '#35221D' }, avatar: { start: '#DC947E', end: '#AC604E' }, accent: '#F0B19C', tint: '#442A23', solid: '#B56855' },
  { wash: { start: '#24362F', end: '#1D2D27' }, avatar: { start: '#8EADA1', end: '#607E72' }, accent: '#B9CDC4', tint: '#24362F', solid: '#66877A' },
  { wash: { start: '#343722', end: '#292D1C' }, avatar: { start: '#AEB989', end: '#798653' }, accent: '#CDD5AA', tint: '#333721', solid: '#7D8957' },
];

function collectiveColor(seed: number, dark: boolean): CollectiveColor {
  const palette = dark ? COLLECTIVE_DARK : COLLECTIVE_LIGHT;
  return palette[Math.abs(Math.floor(seed / 60)) % palette.length];
}

/** Soft card/header wash — sits UNDER surface content at full opacity. */
export function groupGradient(seed: number, dark: boolean): GradientStops {
  return collectiveColor(seed, dark).wash;
}

/** The one BOLD use — the avatar disc. White initials on top. */
export function groupAvatarGradient(seed: number, dark: boolean): GradientStops {
  return collectiveColor(seed, dark).avatar;
}

/** Strong accent (progress ring, tints) readable on surface. */
export function groupAccent(seed: number, dark: boolean): string {
  return collectiveColor(seed, dark).accent;
}

/**
 * Faint fill for hue-themed chips/pills — pairs with groupAccent() text.
 * Group-tab cards flow the group hue through their controls (user decision
 * 2026-07-03), so chip backgrounds come from here, not accent tokens.
 */
export function groupTint(seed: number, dark: boolean): string {
  return collectiveColor(seed, dark).tint;
}

/** Solid readable fill for a hue-themed button; white label on top. */
export function groupSolid(seed: number, dark: boolean): string {
  return collectiveColor(seed, dark).solid;
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
