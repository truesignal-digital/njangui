import { createContext, use } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';

// Light reads best outdoors; dark and system stay a user choice.
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

export type ThemePreferenceValue = {
  preference: ThemePreference;
  mode: ResolvedThemeMode;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

export function useThemePreference(): ThemePreferenceValue {
  const value = use(ThemePreferenceContext);

  if (!value) {
    throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  }

  return value;
}

