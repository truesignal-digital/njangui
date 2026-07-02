import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

import { useAppTheme } from '../../../../src/lib/theme';
import { CalendarAgenda } from '../../../../src/components/calendar-agenda';

/** Group-scoped agenda — every round of this njangi's cycle, month by month. */
export default function GroupCalendarScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

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
          onPress={() => router.back()}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <Text className="font-heading text-headline text-foreground">
          {t('calendar.title')}
        </Text>
      </View>
      <CalendarAgenda groupId={groupId} showGroupName={false} />
    </ScrollView>
  );
}
