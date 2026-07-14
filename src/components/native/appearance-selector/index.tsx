import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/lib/theme';
import type { AppearanceSelectorProps } from './types';

export function AppearanceSelector({
  value,
  options,
  onChange,
}: AppearanceSelectorProps) {
  const theme = useAppTheme();

  return (
    <View
      className="flex-row gap-xs rounded-pill bg-surface-muted p-xs"
      accessibilityRole="radiogroup"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            className="min-h-[44px] flex-1 items-center justify-center rounded-pill"
            style={{ backgroundColor: selected ? theme.surface : 'transparent' }}
          >
            <Text
              className="font-body-semi text-label"
              style={{ color: selected ? theme.accent : theme.textMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type { AppearanceSelectorProps } from './types';

