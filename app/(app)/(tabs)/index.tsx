import type { ReactNode } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  ArrowUpIcon,
  CalendarDaysIcon,
  KeyIcon,
  PlusIcon,
  UsersIcon,
} from 'react-native-heroicons/outline';

import { api } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { toIntlLocale } from '../../../src/lib/app-locale';
import { cn } from '../../../src/lib/cn';
import { formatCurrencyXAF } from '../../../src/lib/format-currency';
import { haptics } from '../../../src/lib/haptics';
import { useAppTheme } from '../../../src/lib/theme';
import { Skeleton } from '../../../src/components/skeleton';
import { AppButton } from '../../../src/components/ui/button';
import { InOutCells } from '../../../src/components/ui/in-out-cells';
import { GroupRow } from '../../../src/components/groups/group-row';
import type { GroupListItem } from '../../../src/components/groups/group-card';
import { usePullRefresh } from '../../../src/hooks/use-pull-refresh';

/**
 * Home — money-hero direction (docs/ui-proposals-iter3-money-hero.html):
 * the screen answers « where does my money stand across all my njangis? »
 * with a net-position hero, a quick-action row and In/Out cells, all
 * server-computed by listMyGroups (myDue/receiving) — no client money math.
 * Auth gating follows piol mobile's screen-level pattern: queries pass
 * 'skip' until authenticated; signed-out users are redirected to sign-in.
 */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const myGroups = useQuery(api.groups.listMyGroups, isAuthenticated ? {} : 'skip');
  const { refreshing, onRefresh } = usePullRefresh();

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xxl,
  };

  // Loading — skeletons matching final geometry, never flash the empty state (docs/03 §D)
  if (!isLoaded || myGroups === undefined) {
    return (
      <View className="flex-1 bg-background px-lg" style={screenPadding}>
        <Skeleton className="h-[28px] w-[140px]" />
        <Skeleton className="mt-lg h-[44px] w-[220px]" />
        <View className="mt-lg flex-row gap-sm">
          <Skeleton className="h-[72px] flex-1 rounded-lg" />
          <Skeleton className="h-[72px] flex-1 rounded-lg" />
          <Skeleton className="h-[72px] flex-1 rounded-lg" />
          <Skeleton className="h-[72px] flex-1 rounded-lg" />
        </View>
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
        </View>
      </View>
    );
  }

  if (myGroups.length === 0) {
    return <HomeEmptyState topInset={insets.top} bottomInset={insets.bottom} />;
  }

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={myGroups as GroupListItem[]}
        keyExtractor={(group) => group.membershipId}
        renderItem={({ item }: ListRenderItemInfo<GroupListItem>) => <GroupRow group={item} />}
        contentContainerStyle={{
          ...screenPadding,
          paddingHorizontal: theme.spacing.lg,
        }}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={<HomeHeader groups={myGroups as GroupListItem[]} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

function ListSeparator() {
  return <View className="h-xs" />;
}

/** One quick-action tile — icon + short label, whole tile pressable. */
function QuickAction({
  icon,
  label,
  onPress,
  disabled = false,
  hot = false,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hot?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className={cn(
        'flex-1 items-center gap-1 rounded-lg border border-border-subtle bg-surface py-sm active:opacity-90',
        hot && 'border-accent bg-accent',
        disabled && 'opacity-50'
      )}
    >
      {icon}
      <Text
        numberOfLines={1}
        className={cn(
          'font-body-semi text-caption text-foreground',
          hot && 'text-primary-fg'
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Hero + quick actions + In/Out cells. All amounts come server-computed
 * (myDue/receiving on each listMyGroups item); this only sums for display.
 */
function HomeHeader({ groups }: { groups: GroupListItem[] }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const locale = toIntlLocale(i18n.language);

  const dues = groups.filter((g) => g.myDue !== null);
  const totalDue = dues.reduce((sum, g) => sum + (g.myDue?.amount ?? 0), 0);
  const nearestDue = [...dues].sort(
    (a, b) => (a.myDue?.dueAt ?? 0) - (b.myDue?.dueAt ?? 0)
  )[0];
  const receivings = groups.filter((g) => g.receiving !== null);
  const totalReceiving = receivings.reduce(
    (sum, g) => sum + (g.receiving?.amount ?? 0),
    0
  );
  const nextReceivingDate = [...receivings].sort(
    (a, b) => (a.receiving?.date ?? 0) - (b.receiving?.date ?? 0)
  )[0]?.receiving?.date;

  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  return (
    <View className="pb-sm">
      <Text className="font-heading text-display-lg text-foreground">
        {t('home.greeting')}
      </Text>

      {/* Net-position hero — the amount to pay leads, receiving is the delta line */}
      <View className="pt-lg">
        <Text className="font-body-semi text-overline uppercase text-muted">
          {t('home.hero.due')}
        </Text>
        <Text className="pt-1 font-mono-bold text-stat-lg text-foreground">
          {formatCurrencyXAF(-totalDue)}
        </Text>
        {totalReceiving > 0 && nextReceivingDate !== undefined ? (
          <Text className="pt-1 font-body-medium text-body-sm text-success-dark">
            {t('home.hero.toReceive', {
              amount: formatCurrencyXAF(totalReceiving),
              date: shortDate(nextReceivingDate),
            })}
          </Text>
        ) : null}
      </View>

      <View className="flex-row gap-xs pt-lg">
        <QuickAction
          hot
          icon={<ArrowUpIcon size={18} color={theme.primaryForeground} />}
          label={t('home.actions.contribute')}
          disabled={!nearestDue?.myDue}
          onPress={() => {
            if (!nearestDue?.myDue) return;
            router.push({
              pathname: '/groups/[groupId]/rounds/[roundId]/pay',
              params: {
                groupId: nearestDue.groupId,
                roundId: nearestDue.myDue.roundId,
              },
            });
          }}
        />
        <QuickAction
          icon={<KeyIcon size={18} color={theme.accent} />}
          label={t('home.actions.join')}
          onPress={() => router.push('/join-by-code')}
        />
        <QuickAction
          icon={<PlusIcon size={18} color={theme.accent} />}
          label={t('home.actions.new')}
          onPress={() => router.push('/groups/new')}
        />
        <QuickAction
          icon={<CalendarDaysIcon size={18} color={theme.accent} />}
          label={t('home.actions.calendar')}
          onPress={() => router.push('/calendar')}
        />
      </View>

      <View className="pt-md">
        <InOutCells
          payLabel={t('home.inOut.toPay')}
          payAmount={formatCurrencyXAF(totalDue)}
          receiveLabel={t('home.inOut.toReceive')}
          receiveAmount={formatCurrencyXAF(totalReceiving)}
        />
      </View>

      <Text className="pb-sm pt-lg font-body-semi text-overline uppercase text-muted">
        {t('home.groupsSection', { count: groups.length })}
      </Text>
    </View>
  );
}

/** Empty state per docs/03 §D — warm copy, one-thumb CTAs in the bottom zone. */
function HomeEmptyState({ topInset, bottomInset }: { topInset: number; bottomInset: number }) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <View
      className="flex-1 bg-background px-lg"
      style={{ paddingTop: topInset, paddingBottom: bottomInset + theme.spacing.xl }}
    >
      <View className="flex-1 items-center justify-center gap-xl">
        <View className="h-[64px] w-[64px] items-center justify-center rounded-full bg-surface-muted">
          <UsersIcon size={30} color={theme.textMuted} />
        </View>
        <View className="items-center gap-xs">
          <Text className="text-center font-heading text-headline text-foreground">
            {t('home.emptyTitle')}
          </Text>
          <Text className="max-w-[300px] text-center font-body text-body-sm text-muted">
            {t('home.emptyBody')}
          </Text>
        </View>
      </View>
      <View className="gap-sm">
        <AppButton
          label={t('home.emptyCreate')}
          icon={<PlusIcon size={18} color={theme.primaryForeground} />}
          onPress={() => router.push('/groups/new')}
        />
        <AppButton
          variant="outline"
          label={t('home.emptyHaveLink')}
          icon={<KeyIcon size={18} color={theme.accent} />}
          onPress={() => router.push('/join-by-code')}
        />
        <Text className="pt-xs text-center font-body text-caption text-placeholder">
          {t('auth.custodyNote')}
        </Text>
      </View>
    </View>
  );
}
