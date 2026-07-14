import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { Appearance, useColorScheme } from 'react-native';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { mobileUiConfig } from '@/lib/mobile-ui-config';
import {
  ThemePreferenceContext,
  type ThemePreference,
} from '@/lib/theme-preference';

const STORAGE_KEY = 'njangi.appearance';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const mode =
    preference === 'system'
      ? deviceScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? null : preference);
  }, [preference]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(
      mobileUiConfig.colors[mode].background
    );
  }, [mode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ preference, mode, hydrated, setPreference }),
    [hydrated, mode, preference, setPreference]
  );

  return (
    <ThemePreferenceContext value={value}>
      {children}
    </ThemePreferenceContext>
  );
}
