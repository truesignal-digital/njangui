import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

import { useAppTheme } from '../../../../src/lib/theme';
import { CalendarAgenda } from '../../../../src/components/calendar-agenda';
import { NjangiMark } from '../../../../src/components/brand/njangi-mark';

/** Group-scoped agenda — every round of this njangi's cycle, month by month. */
export default function GroupCalendarScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  // `name` rides along from group detail so the header keeps group context
  // while the agenda query resolves (params-transition rule).
  const { groupId, name } = useLocalSearchParams<{
    groupId: string;
    name?: string;
  }>();

  if (!groupId) return null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center gap-xs pb-lg">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="font-heading text-headline text-foreground">
            {t('calendar.title')}
          </Text>
          {name ? (
            <Text
              numberOfLines={1}
              className="font-body text-body-sm text-muted"
            >
              {name}
            </Text>
          ) : null}
        </View>
        <NjangiMark size={32} color={theme.successDark} />
      </View>
      <CalendarAgenda groupId={groupId} mode="group" />
    </ScrollView>
  );
}
