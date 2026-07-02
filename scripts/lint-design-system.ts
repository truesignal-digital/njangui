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
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');
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

// 5 — auth-spec CI greps (must-fix #2/#3): CSPRNG only in the OTP engine;
// no fixed-credential test codes anywhere in app or backend code.
import { readdirSync, statSync } from 'node:fs';
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '_generated' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}
for (const file of ['convex/otp.ts', 'convex/devices.ts']) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  if (/Math\.random/.test(src)) {
    errors.push(`${file}: Math.random is banned — CSPRNG only (auth spec must-fix #3)`);
  }
}
for (const path of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'convex'))]) {
  const src = readFileSync(path, 'utf8');
  if (/TEST_CODE/.test(src)) {
    errors.push(`${path}: TEST_CODE fixed-credential pattern is banned (auth spec must-fix #2)`);
  }
}

if (errors.length > 0) {
  console.error(`✗ design-system lint — ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  • ${error}`);
  process.exit(1);
}
console.log('✓ design-system lint clean');
