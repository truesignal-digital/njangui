/**
 * Generate the unique app-wide username from the person's real name —
 * users never invent one (auth decision: username is the login + the
 * add-member search key, so it must exist and be predictable).
 * `prenom.nom`, lowercase, deaccented; digits appended on collision
 * retries (Clerk rejects duplicates with form_identifier_exists).
 */
function slugifyNamePart(part: string): string {
  return part
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function generateUsername(
  firstName: string,
  lastName: string,
  attempt: number
): string {
  // Hyphen joiner — Clerk usernames allow letters/digits/_/- only (no dots).
  const base =
    [slugifyNamePart(firstName), slugifyNamePart(lastName)]
      .filter(Boolean)
      .join('-') || 'membre';
  // Clerk's minimum is 4 chars; short names always carry a suffix.
  if (attempt === 0 && base.length >= 4) {
    return base;
  }
  const suffix = String(Math.floor(Math.random() * 90) + 10);
  return `${base}${suffix}`;
}
