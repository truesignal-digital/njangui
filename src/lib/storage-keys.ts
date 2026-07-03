/*
 * Registry of every device-local storage key. New keys are declared here
 * (and only here) so collisions, migrations, and leftover-data bugs are
 * greppable in one place. Owner modules import from this file — never
 * inline a key string in a screen or hook.
 */
export const storageKeys = {
  /** SecureStore — src/lib/app-language.ts */
  language: 'njangi-language',
  /** SecureStore keychain service — src/lib/device-credential.ts */
  deviceKeychainService: 'njangi.device',
  /** SecureStore — src/lib/device-credential.ts */
  deviceSecret: 'njangi-device-secret',
  /** SecureStore — src/lib/device-credential.ts */
  deviceId: 'njangi-device-id',
  /** AsyncStorage, per round — src/lib/meeting-queue.ts */
  meetingQueue: (roundId: string) => `njangi-meeting-queue-${roundId}`,
  /** AsyncStorage, per method+language — src/lib/ussd-content.ts */
  ussdContent: (method: string, language: string) => `njangi-ussd-${method}-${language}`,
} as const;
