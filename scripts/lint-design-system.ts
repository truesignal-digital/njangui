/**
 * Custody-copy / terminology lint (docs/00 red line, docs/03 §F, docs/04
 * rules 3+7; built per payment-features-plan Slice 0d). Run: `bun run
 * lint:design` — part of every slice's chunk gate alongside typecheck.
 *
 * Checks:
 * 1. Banned custody terms never appear in locale copy (per-language list in
 *    scripts/custody-copy-allowlist.json; exact key-path exceptions only).
 * 2. Custody framing: any locale key matching custodyKeyPattern (pot lines,
 *    *.custody) must NAME the money holder — never a bare balance.
 * 3. PAYMENT_STATE_TONE covers all five payment states (chips are
 *    icon+word+color, never color alone — 03 §G).
 * 4. fr.json and en.json expose the same key set (FR-first i18n contract —
 *    a key present in one language only ships a raw key to users).
 * 5. App-owned UI uses Heroicons, not emoji or a competing icon package.
 * 6. Tokens (src/lib/mobile-ui-config.json): colors.light and colors.dark are
 *    key-identical; no typography entry but tabLabel is below 14 px; the
 *    light background is a neutral grey (no cream); textMuted on background
 *    is >= 7:1 in light; every status *Dark on *Bg is >= 4.5:1 in both modes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');
const UI_CONFIG_PATH = join(ROOT, 'src', 'lib', 'mobile-ui-config.json');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'custody-copy-allowlist.json');

interface LanguageRules {
  bannedTerms: string[];
  exceptions: Record<string, string>;
}
interface Allowlist {
  fr: LanguageRules;
  en: LanguageRules;
  custodyKeyPattern: string;
  custodyMarkers: Record<'fr' | 'en', string[]>;
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as Allowlist;
const custodyKeyRe = new RegExp(allowlist.custodyKeyPattern, 'i');

function flatten(
  node: unknown,
  prefix: string,
  out: Map<string, string>
): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const errors: string[] = [];

const flat: Record<'fr' | 'en', Map<string, string>> = {
  fr: new Map(),
  en: new Map(),
};

for (const lang of ['fr', 'en'] as const) {
  const file = join(LOCALES_DIR, `${lang}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  flatten(data, '', flat[lang]);
  const rules = allowlist[lang];

  for (const [keyPath, value] of flat[lang]) {
    const lower = value.toLowerCase();

    // 1 — banned custody terms.
    for (const term of rules.bannedTerms) {
      if (lower.includes(term.toLowerCase()) && !(keyPath in rules.exceptions)) {
        errors.push(
          `${lang}.json ${keyPath}: banned term « ${term} » in "${value}"`
        );
      }
    }

    // 2 — custody framing: pot/custody lines must name the holder.
    if (custodyKeyRe.test(keyPath)) {
      const markers = allowlist.custodyMarkers[lang];
      if (!markers.some((m) => lower.includes(m.toLowerCase()))) {
        errors.push(
          `${lang}.json ${keyPath}: custody line must name the money holder ` +
            `(one of: ${markers.join(', ')}) — bare balances are forbidden (00 red line)`
        );
      }
    }

    // 5a — pictographic emoji are not UI icons. State must use a Heroicon
    // component plus readable copy so VoiceOver does not announce decoration.
    if (/\p{Extended_Pictographic}/u.test(value)) {
      errors.push(
        `${lang}.json ${keyPath}: emoji is not an app-owned icon — use a Heroicon in the component`
      );
    }
  }
}

// 4 — fr/en key parity.
for (const key of flat.fr.keys()) {
  if (!flat.en.has(key)) errors.push(`en.json missing key ${key} (present in fr.json)`);
}
for (const key of flat.en.keys()) {
  if (!flat.fr.has(key)) errors.push(`fr.json missing key ${key} (present in en.json)`);
}

// 3 — PAYMENT_STATE_TONE completeness (source check, no RN import needed).
const badgeSrc = readFileSync(
  join(ROOT, 'src', 'components', 'ui', 'badge.tsx'),
  'utf8'
);
if (!badgeSrc.includes('PAYMENT_STATE_TONE')) {
  errors.push('badge.tsx: PAYMENT_STATE_TONE map is missing');
} else {
  for (const state of ['pending', 'claimed', 'confirmed', 'disputed', 'cancelled']) {
    if (!new RegExp(`${state}\\s*:\\s*\\{`).test(badgeSrc)) {
      errors.push(`badge.tsx: PAYMENT_STATE_TONE missing '${state}' entry`);
    }
  }
}

// 5b — Heroicons is the sole app-owned icon library. Native Tabs and native
// date controls may still name SF Symbols / Material Symbols through the OS.
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

for (const file of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'src'))]) {
  const source = readFileSync(file, 'utf8');
  if (/from ['"](?:@expo\/vector-icons|expo-symbols)['"]/.test(source)) {
    errors.push(
      `${file.slice(ROOT.length + 1)}: app-owned icons must come from react-native-heroicons`
    );
  }
}

// 6 — token guards.
type UiConfig = {
  colors: Record<'light' | 'dark', Record<string, string>>;
  typography: Record<string, { fontSize: number }>;
};
const uiConfig = JSON.parse(readFileSync(UI_CONFIG_PATH, 'utf8')) as UiConfig;
const lightKeys = Object.keys(uiConfig.colors.light);
const darkKeys = Object.keys(uiConfig.colors.dark);
for (const key of lightKeys) {
  if (!darkKeys.includes(key)) errors.push(`mobile-ui-config: colors.dark missing ${key}`);
}
for (const key of darkKeys) {
  if (!lightKeys.includes(key)) errors.push(`mobile-ui-config: colors.light missing ${key}`);
}
for (const [name, style] of Object.entries(uiConfig.typography)) {
  if (name !== 'tabLabel' && style.fontSize < 14) {
    errors.push(`mobile-ui-config: typography.${name} is ${style.fontSize} px (minimum 14)`);
  }
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const [bgR, bgG, bgB] = channels(uiConfig.colors.light.background);
if (bgR !== bgG || bgG !== bgB) {
  errors.push(`mobile-ui-config: light background ${uiConfig.colors.light.background} is tinted, not neutral`);
}
const mutedRatio = contrast(uiConfig.colors.light.textMuted, uiConfig.colors.light.background);
if (mutedRatio < 7) {
  errors.push(`mobile-ui-config: light textMuted on background is ${mutedRatio.toFixed(2)}:1 (minimum 7)`);
}
for (const mode of ['light', 'dark'] as const) {
  const palette = uiConfig.colors[mode];
  for (const status of ['success', 'warning', 'destructive', 'info']) {
    const ratio = contrast(palette[`${status}Dark`], palette[`${status}Bg`]);
    if (ratio < 4.5) {
      errors.push(`mobile-ui-config: ${mode} ${status}Dark on ${status}Bg is ${ratio.toFixed(2)}:1 (minimum 4.5)`);
    }
  }
}

if (errors.length > 0) {
  console.error(`✗ design-system lint — ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  • ${error}`);
  process.exit(1);
}
console.log('✓ design-system lint clean');
