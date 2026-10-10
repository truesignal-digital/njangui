import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { formatCurrencyXAF } from '@/lib/format-currency';
import { groupAccent } from '@/lib/group-colors';
import { useAppTheme } from '@/lib/theme';
import { mobileUiConfig } from '@/lib/mobile-ui-config';

/**
 * The pot filling up IS the njangi — the fill animates (spring) on every
 * confirmed payment so money being acknowledged is something you can SEE.
 * Custody-captioned, never a bare balance (00 red line). When a group
 * seed is provided the fill takes the group's accent hue. The bar tracks
 * confirmed money only; cash the custodian ticked at the meeting shows as
 * its own « en main » figure until the payers confirm.
 */
export function PotProgress({
  confirmedTotal,
  expectedTotal,
  inFlightTotal,
  inHandTotal,
  custodianName,
  colorSeed,
}: {
  confirmedTotal: number;
  expectedTotal: number;
  inFlightTotal: number;
  inHandTotal: number;
  custodianName: string;
  colorSeed?: number | null;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const dark = theme.isDark;
  const pct =
    expectedTotal > 0
      ? Math.min(100, Math.round((confirmedTotal / expectedTotal) * 100))
      : 0;

  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = reducedMotion
      ? pct
      : withTiming(pct, { duration: mobileUiConfig.motion.successDuration });
  }, [pct, reducedMotion, width]);
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
      {inHandTotal > confirmedTotal ? (
        <Text
          className="font-body-medium text-body-sm text-foreground"
          testID="pot-in-hand"
        >
          {t('round.pot.inHand', {
            amount: formatCurrencyXAF(inHandTotal),
            name: custodianName,
          })}
        </Text>
      ) : null}
      {inFlightTotal > 0 ? (
        <Text className="font-body text-caption text-muted">
          {t('round.inFlight', { amount: formatCurrencyXAF(inFlightTotal) })}
        </Text>
      ) : null}
    </View>
  );
}
