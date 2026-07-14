import { createContext, use } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';

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

