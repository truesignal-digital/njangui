import type { ThemePreference } from '@/lib/theme-preference';

export type AppearanceOption = {
  value: ThemePreference;
  label: string;
};

export type AppearanceSelectorProps = {
  value: ThemePreference;
  options: AppearanceOption[];
  colorScheme: 'light' | 'dark';
  accentColor: string;
  onChange: (value: ThemePreference) => void;
};

