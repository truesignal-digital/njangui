import { RefreshControl, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';

import { api } from '@/lib/convex-api';
import { useAuth } from '@/lib/clerk-client';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/lib/theme';
import { Skeleton } from '@/components/skeleton';
import { AppButton } from '@/components/ui/button';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { StatusBarCover } from '@/components/ui/status-bar-cover';
import {
  GroupCard,
  type GroupListItem,
} from '@/components/groups/group-card';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { NjangiMark } from '@/components/brand/njangi-mark';
import { Icon } from '@/components/ui/icon';

/**
 * Groupe tab — calm row list (round-2 §2 option B): one gradient disc,
 * one fact line, one attention chip per group. Sorted living-first;
 * paused/archived rows dim in place instead of separate sections.
 */

/** Active soonest-due first, then setup, between_cycles, paused, archived. */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  setup: 1,
  between_cycles: 2,
  paused: 3,
  archived: 4,
};

export default function GroupTabScreen() {
  const { t } = useTranslation();
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
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || myGroups === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <Skeleton className="h-[32px] w-[160px]" />
        <Skeleton className="mt-xs h-[16px] w-[190px]" />
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[132px] rounded-2xl" />
          <Skeleton className="h-[132px] rounded-2xl" />
          <Skeleton className="h-[132px] rounded-2xl" />
        </View>
      </View>
    );
  }

  const groups = myGroups as GroupListItem[];
  // Groups that need the viewer outrank everything, then urgency, then the
  // usual living-first status order — the header count must match the rows
  // the user meets first.
  const needsViewer = (g: GroupListItem) =>
    g.myDue !== null || g.receiving !== null ? 0 : 1;
  const sorted = [...groups].sort((a, b) => {
    const need = needsViewer(a) - needsViewer(b);
    if (need !== 0) return need;
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    const dueA = a.nextDueAt ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.nextDueAt ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return a.name.localeCompare(b.name);
  });

  const actionCount = groups.filter((g) => needsViewer(g) === 0).length;
  const activeCount = groups.filter((g) => g.status === 'active').length;

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={sorted}
        keyExtractor={(group) => group.membershipId}
        renderItem={({ item }: ListRenderItemInfo<GroupListItem>) => (
          <GroupCard group={item} />
        )}
        contentContainerStyle={screenPadding}
        ItemSeparatorComponent={ListSeparator}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View className="pb-md">
            <View className="mb-xs flex-row items-center gap-xs">
              <NjangiMark size={20} />
              <Text className="font-heading text-title text-foreground">
                {t('common.appName')}
              </Text>
            </View>
            <Text className="pb-xs font-body-semi text-overline uppercase text-success-dark">
              {t('groups.tab.eyebrow')}
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="font-heading text-display-lg text-foreground">
                {t('groups.tab.collectiveTitle')}
              </Text>
              <SoftPressable
                accessibilityRole="button"
                accessibilityLabel={t('groups.tab.addAction')}
                onPress={() => {
                  haptics.select();
                  router.push('/create-or-join');
                }}
                className="h-[44px] w-[44px] items-center justify-center rounded-full bg-success-bg active:opacity-80"
              >
                <Icon name="add" size="control" color={theme.successDark} />
              </SoftPressable>
            </View>
            {groups.length > 0 ? (
              <View className="flex-row flex-wrap gap-xs pt-sm">
                <View className="rounded-pill bg-success-bg px-sm py-xs">
                  <Text className="font-body-semi text-caption text-success-dark">
                    {t('groups.tab.activeCount', { count: activeCount })}
                  </Text>
                </View>
                {actionCount > 0 ? (
                  <View className="rounded-pill bg-warning-bg px-sm py-xs">
                    <Text className="font-body-semi text-caption text-warning-dark">
                      {t('groups.tab.needYou', { count: actionCount })}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-sm pt-xl">
            <View className="h-[56px] w-[56px] items-center justify-center rounded-full border border-border bg-surface">
              <Icon name="groups" size="emphasis" color={theme.textMuted} />
            </View>
            <Text className="font-body-semi text-title text-foreground">
              {t('groups.tab.emptyTitle')}
            </Text>
            <Text className="text-center font-body text-body-sm text-muted">
              {t('groups.tab.emptyBody')}
            </Text>
            <View className="mt-sm w-full gap-sm">
              <AppButton
                label={t('groups.tab.create')}
                onPress={() => router.push('/groups/new')}
              />
              <AppButton
                variant="outline"
                label={t('groups.tab.join')}
                onPress={() => router.push('/join-by-code')}
              />
            </View>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <StatusBarCover />
    </View>
  );
}

function ListSeparator() {
  return <View className="h-sm" />;
}
