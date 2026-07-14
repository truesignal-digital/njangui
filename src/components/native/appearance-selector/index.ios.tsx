import {
  Host,
  Picker,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';

import type { ThemePreference } from '@/lib/theme-preference';
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
      style={{ width: '100%', height: 42 }}
    >
      <Picker<ThemePreference>
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('segmented'), frame({ maxWidth: 1000 })]}
      >
        {options.map((option) => (
          <SwiftText key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </SwiftText>
        ))}
      </Picker>
    </Host>
  );
}

