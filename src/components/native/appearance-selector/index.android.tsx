import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { useAppTheme } from '@/lib/theme';
import type { AppearanceSelectorProps } from './types';

export function AppearanceSelector({
  value,
  options,
  colorScheme,
  accentColor,
  onChange,
}: AppearanceSelectorProps) {
  const theme = useAppTheme();

  return (
    <Host
      colorScheme={colorScheme}
      seedColor={accentColor}
      style={{ width: '100%', height: 52 }}
    >
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {options.map((option) => (
          <SegmentedButton
            key={option.value}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <SegmentedButton.Label>
              <Text color={theme.text}>{option.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}

