import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { storageKeys } from './storage-keys';

/**
 * Device credential storage (auth spec, device-bind): the 256-bit bearer
 * secret lives in the OS keychain/keystore, non-migrating
 * (WHEN_UNLOCKED_THIS_DEVICE_ONLY) and biometric/passcode-gated on read
 * where the OS supports it. The deviceId lives in a SEPARATE,
 * non-authenticated key so the app can know "this device is registered"
 * without prompting.
 *
 * Gated reads throw when biometrics change (hardware invalidation), on the
 * iOS Simulator, and on some Android 14 face-only enrollments — every read
 * is wrapped and a failure falls back to ONE WhatsApp re-enrollment, never
 * a crash. If the auth-gated WRITE fails (sim/dev), we degrade to an
 * ungated write so device-login still works in development.
 */

const KEYCHAIN_SERVICE = storageKeys.deviceKeychainService;
const KEY_SECRET = storageKeys.deviceSecret;
const KEY_DEVICE_ID = storageKeys.deviceId;

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_DEVICE_ID, {
    keychainService: KEYCHAIN_SERVICE,
  });
  if (existing) {
    return existing;
  }
  const deviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY_DEVICE_ID, deviceId, {
    keychainService: KEYCHAIN_SERVICE,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return deviceId;
}

export async function storeDeviceSecret(
  secret: string,
  authenticationPrompt: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_SECRET, secret, {
      keychainService: KEYCHAIN_SERVICE,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true,
      authenticationPrompt,
    });
  } catch {
    // Simulator / no-biometric device: keep the credential usable, still
    // device-bound and non-migrating — just not biometric-gated.
    await SecureStore.setItemAsync(KEY_SECRET, secret, {
      keychainService: KEYCHAIN_SERVICE,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

/** Biometric-gated read; null = no credential OR the gate refused/invalidated. */
export async function readDeviceSecret(
  authenticationPrompt: string
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_SECRET, {
      keychainService: KEYCHAIN_SERVICE,
      requireAuthentication: true,
      authenticationPrompt,
    });
  } catch {
    try {
      // Ungated fallback storage path (sim/dev writes above).
      return await SecureStore.getItemAsync(KEY_SECRET, {
        keychainService: KEYCHAIN_SERVICE,
      });
    } catch {
      return null;
    }
  }
}

export async function clearDeviceSecret(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_SECRET, {
      keychainService: KEYCHAIN_SERVICE,
    });
  } catch {
    // nothing to clear
  }
}
