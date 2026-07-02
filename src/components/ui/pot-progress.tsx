import { useEffect } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { formatCurrencyXAF } from '../../lib/format-currency';
import { groupAccent } from '../../lib/group-colors';
import { useAppTheme } from '../../lib/theme';

/**
 * The pot filling up IS the njangi — the fill animates (spring) on every
 * confirmed payment so money being acknowledged is something you can SEE.
 * Custody-captioned, never a bare balance (00 red line). When a group
 * seed is provided the fill takes the group's accent hue.
 */
export function PotProgress({
  confirmedTotal,
  expectedTotal,
  inFlightTotal,
  custodianName,
  colorSeed,
}: {
  confirmedTotal: number;
  expectedTotal: number;
  inFlightTotal: number;
  custodianName: string;
  colorSeed?: number | null;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const dark = useColorScheme() === 'dark';
  const pct =
    expectedTotal > 0
      ? Math.min(100, Math.round((confirmedTotal / expectedTotal) * 100))
      : 0;

  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = withSpring(pct, { damping: 18, stiffness: 120 });
  }, [pct, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const fillColor =
    colorSeed !== undefined && colorSeed !== null
      ? groupAccent(colorSeed, dark)
      : theme.accent;

  return (
    <View className="gap-xs">
      <Text className="font-body-semi text-body text-foreground">
        {t('round.pot.custody', {
          confirmed: formatCurrencyXAF(confirmedTotal),
          expected: formatCurrencyXAF(expectedTotal),
          name: custodianName,
        })}
      </Text>
      <View className="h-[8px] overflow-hidden rounded-pill bg-surface-muted">
        <Animated.View
          className="h-full rounded-pill"
          style={[fillStyle, { backgroundColor: fillColor }]}
        />
      </View>
      {inFlightTotal > 0 ? (
        <Text className="font-body text-caption text-muted">
          {t('round.inFlight', { amount: formatCurrencyXAF(inFlightTotal) })}
        </Text>
      ) : null}
    </View>
  );
}
