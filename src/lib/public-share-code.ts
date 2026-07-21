const PUBLIC_SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

/**
 * Treat route input as an opaque capability token. This validation only keeps
 * malformed URLs away from the public query; it never proves that a Group
 * exists and must not be logged or used as an analytics dimension.
 */
export function getPublicShareCodeCandidate(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== 'string' || !PUBLIC_SHARE_CODE_PATTERN.test(value)) {
    return null;
  }

  return value;
}
