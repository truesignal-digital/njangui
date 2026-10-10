import { useMemo } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAttention } from '@/hooks/use-attention';
import { ICONS } from '@/lib/icons';
import { useAppTheme } from '@/lib/theme';

/**
 * Three stable native destinations. Calendar and Profile are secondary Stack
 * screens so the resting shell answers Today · Groups · Actions only.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { data } = useAttention();
  const badge = data?.badgeCount
    ? data.badgeCount > 99
      ? '99+'
      : String(data.badgeCount)
    : undefined;

  // Referentially stable across attention re-renders: fresh style/color
  // objects each render make the native tab bar re-apply its appearance,
  // which is what intermittently blanks an unselected item on iOS 18.
  const iconColor = useMemo(
    () => ({ default: theme.textMuted, selected: theme.accent }),
    [theme]
  );
  const labelStyle = useMemo(
    () => ({
      default: {
        color: theme.textMuted,
        fontFamily: 'PlusJakartaSans_600SemiBold',
      },
      selected: {
        color: theme.accent,
        fontFamily: 'PlusJakartaSans_600SemiBold',
      },
    }),
    [theme]
  );

  return (
    <NativeTabs
      tintColor={theme.accent}
      iconColor={iconColor}
      labelStyle={labelStyle}
      backgroundColor={theme.surface}
      blurEffect={
        process.env.EXPO_OS === 'ios'
          ? theme.isDark
            ? 'systemChromeMaterialDark'
            : 'systemChromeMaterialLight'
          : undefined
      }
      shadowColor={theme.borderSubtle}
      indicatorColor={theme.accentLight}
      rippleColor={theme.accentMuted}
      labelVisibilityMode="labeled"
      tabBarRespectsIMEInsets
      badgeBackgroundColor={theme.destructive}
      backBehavior="history"
      minimizeBehavior={
        process.env.EXPO_OS === 'ios' && Number(Platform.Version) >= 26
          ? 'never'
          : undefined
      }
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: ICONS.today.ios, selected: `${ICONS.today.ios}.fill` }}
          md={ICONS.today.android}
        />
        <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Icon
          sf={{ default: ICONS.groups.ios, selected: `${ICONS.groups.ios}.fill` }}
          md={ICONS.groups.android}
        />
        <NativeTabs.Trigger.Label>{t('tabs.group')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon
          sf={{ default: ICONS.actions.ios, selected: `${ICONS.actions.ios}.fill` }}
          md={ICONS.actions.android}
        />
        <NativeTabs.Trigger.Label>{t('tabs.inbox')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!badge}>
          {badge}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
