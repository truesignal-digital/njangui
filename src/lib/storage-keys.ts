/*
 * Registry of every device-local storage key. New keys are declared here
 * (and only here) so collisions, migrations, and leftover-data bugs are
 * greppable in one place. Owner modules import from this file — never
 * inline a key string in a screen or hook.
 */
export const storageKeys = {
  /** SecureStore — src/lib/app-language.ts */
  language: 'njangi-language',
  // 'njangi.device' / 'njangi-device-secret' / 'njangi-device-id' were the
  // retired OTP device credential (removed 2026-07) — never repurpose them.
  /** AsyncStorage, per round — src/lib/meeting-queue.ts */
  meetingQueue: (roundId: string) => `njangi-meeting-queue-${roundId}`,
  /** AsyncStorage, per method+language — src/lib/ussd-content.ts */
  ussdContent: (method: string, language: string) => `njangi-ussd-${method}-${language}`,
} as const;
