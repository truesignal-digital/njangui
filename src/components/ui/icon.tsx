import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { View, type ColorValue } from 'react-native';

import {
  ICON_SIZE,
  ICONS,
  iconAccessibilityProps,
  type IconName,
  type IconSize,
} from '@/lib/icons';

// A misspelled platform name in ICONS fails typecheck here.
ICONS satisfies Record<IconName, { ios: SFSymbol; android: AndroidSymbol }>;

/**
 * Native icon: SF Symbol on iOS, Material Symbol on Android. Decorative by
 * default; pass a translated `accessibilityLabel` when the icon alone
 * carries meaning. Icon-only buttons label the Pressable, not the icon.
 */
export function Icon({
  name,
  size,
  color,
  accessibilityLabel,
}: {
  name: IconName;
  size: IconSize;
  color: ColorValue;
  accessibilityLabel?: string;
}) {
  const symbol = ICONS[name];
  const px = ICON_SIZE[size];

  return (
    <View
      style={{ width: px, height: px }}
      {...iconAccessibilityProps(accessibilityLabel)}
    >
      <SymbolView
        name={{ ios: symbol.ios, android: symbol.android }}
        size={px}
        tintColor={color}
      />
    </View>
  );
}
