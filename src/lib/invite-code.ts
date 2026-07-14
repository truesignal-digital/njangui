export const INVITE_CODE_LENGTH = 6;

/** Accept a bare code, an Njangi deep link, or a pasted WhatsApp message. */
export function extractInviteCode(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/(?:\/j\/|njangi:\/\/j\/)([A-Za-z0-9]{4,10})/i);
  const explicit = trimmed.match(/(?:code|invitation)\s*[:#-]?\s*([A-Za-z0-9]{6})/i);
  const candidate = (
    fromLink?.[1] ??
    explicit?.[1] ??
    trimmed.split(/[\s/]+/).findLast((part) => /^[A-Za-z0-9]{6}$/.test(part)) ??
    ''
  ).toUpperCase();

  return /^[A-Z0-9]{6}$/.test(candidate) ? candidate : null;
}

export function inviteCodeCells(input: string): string[] {
  const extracted = extractInviteCode(input);
  const candidate = extracted ?? input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return Array.from({ length: INVITE_CODE_LENGTH }, (_, index) => candidate[index] ?? '');
}
