import * as SecureStore from 'expo-secure-store';

import { isAppLocale, type AppLocale } from './app-locale';

/**
 * Persisted FR/EN choice (docs/03 B10 — the toggle survives app restarts).
 * Mirrors the web app's localStorage("njangi-language") via piol mobile's
 * small async get/set module pattern. SecureStore is already a dependency
 * (Clerk token cache), so no extra storage package is needed.
 */
const STORAGE_KEY = 'njangi-language';

export async function getStoredAppLanguage(): Promise<AppLocale | null> {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return value && isAppLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export async function setStoredAppLanguage(locale: AppLocale): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable — the language still switches for this session.
  }
}
