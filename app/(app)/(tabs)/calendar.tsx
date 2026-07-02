import { RefreshControl, ScrollView, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../../src/lib/clerk-client';
import { useAppTheme } from '../../../src/lib/theme';
import { CalendarAgenda } from '../../../src/components/calendar-agenda';
import { usePullRefresh } from '../../../src/hooks/use-pull-refresh';

/**
 * Calendrier (docs/03): the cross-njangi planning surface — every round
 * of every group I'm in, month by month, with what I pay and what I
 * collect. Group-scoped version lives at groups/[groupId]/calendar.
 */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { refreshing, onRefresh } = usePullRefresh();

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text className="pb-lg font-heading text-headline text-foreground">
        {t('calendar.title')}
      </Text>
      <CalendarAgenda mode="my" />
    </ScrollView>
  );
}
