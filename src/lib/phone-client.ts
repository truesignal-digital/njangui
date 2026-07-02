// Client copy of convex/utils/phone.ts (the convex dir is not importable
// from the app bundle). Keep the two in sync.

const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Strip spaces, dashes, dots and parentheses; keep a leading '+'. */
export function normalizePhone(input: string): string {
  return input.replace(/[\s\-().]/g, '');
}

export function isValidE164(phone: string): boolean {
  return E164_RE.test(phone);
}
