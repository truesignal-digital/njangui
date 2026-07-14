import { Image } from 'expo-image';
import { View } from 'react-native';

import { useAppTheme } from '@/lib/theme';

const MARK = require('../../../assets/adaptive-icon-monochrome.png');

/**
 * The actual Njangi mark. Keep it rare and recognizable: this component is
 * for brand identity, never for status, progress, or a financial metric.
 */
export function NjangiMark({
  size = 28,
  color,
  framed = false,
  accessibilityLabel = 'Njangi',
}: {
  size?: number;
  color?: string;
  framed?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const markColor = color ?? theme.accent;

  const mark = (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image
        source={MARK}
        accessibilityLabel={accessibilityLabel}
        contentFit="contain"
        tintColor={markColor}
        style={{ width: size * 1.42, height: size * 1.42 }}
      />
    </View>
  );

  if (!framed) return mark;

  return (
    <View
      style={{
        width: size + 16,
        height: size + 16,
        borderRadius: Math.max(12, (size + 16) * 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.accentHero,
      }}
    >
      <Image
        source={MARK}
        accessibilityLabel={accessibilityLabel}
        contentFit="contain"
        tintColor={theme.textInverted}
        style={{ width: size * 1.42, height: size * 1.42 }}
      />
    </View>
  );
}
