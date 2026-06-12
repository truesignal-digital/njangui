// E.164 phone helpers (02 §a: feature-phone members are matched to later
// Clerk sign-ups on E.164 phone via this module).
//
// Cameroon numbers look like +2376XXXXXXXX / +2372XXXXXXXX, but generic
// E.164 is accepted — diaspora members participating in njangis from abroad
// are routine, and the phone is also the member's MoMo/OM identity.

const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Strip spaces, dashes, dots and parentheses; keep a leading '+'. */
export function normalizePhone(input: string): string {
  return input.replace(/[\s\-().]/g, '');
}

export function isValidE164(phone: string): boolean {
  return E164_RE.test(phone);
}
