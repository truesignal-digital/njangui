import { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { CalendarAgenda } from '@/components/calendar-agenda';
import { DateSelector } from '@/components/native/date-selector';
import { AppScreen } from '@/components/ui/screen';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useAuth } from '@/lib/clerk-client';
import { useAppTheme } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { toIntlLocale } from '@/lib/app-locale';
import { Icon } from '@/components/ui/icon';

/**
 * Calendrier (docs/03): the cross-njangi planning surface — every round
 * of every group I'm in, month by month, with what I pay and what I
 * collect. Group-scoped version lives at groups/[groupId]/calendar.
 */
export default function CalendarScreen() {
  const theme = useAppTheme();
  const { t, i18n } = useTranslation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { refreshing, onRefresh } = usePullRefresh();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const locale = toIntlLocale(i18n.language);

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <AppScreen
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ),
        contentContainerStyle: { gap: 0 },
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-body-semi text-overline uppercase text-success-dark">
          {t('calendar.acrossGroups')}
        </Text>
        <View className="h-[40px] w-[40px] items-center justify-center rounded-full bg-success-bg">
          <Icon name="calendar" size="control" color={theme.successDark} />
        </View>
      </View>
      <View
        className="overflow-hidden rounded-2xl border border-border-subtle bg-surface p-sm"
        style={{ ...theme.shadow('card'), borderCurve: 'continuous' }}
      >
        <DateSelector
          value={selectedDate}
          onChange={(date) => {
            const next = new Date(date);
            next.setHours(0, 0, 0, 0);
            setSelectedDate(next);
          }}
          accessibilityLabel={t('calendar.chooseDate')}
        />
      </View>
      <Text className="pt-lg font-body-semi text-overline uppercase text-muted">
        {selectedDate.toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </Text>
      <CalendarAgenda
        mode="my"
        showMonthSummary={false}
        selectedDate={selectedDate}
      />
    </AppScreen>
  );
}
