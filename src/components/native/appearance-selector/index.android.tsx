import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import type { AppearanceSelectorProps } from './types';

export function AppearanceSelector({
  value,
  options,
  colorScheme,
  accentColor,
  onChange,
}: AppearanceSelectorProps) {
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
            <SegmentedButton.Label>{option.label}</SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}

