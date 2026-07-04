import { useEffect, useRef, useState } from 'react';
import {
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { KeyIcon, PlusIcon, UsersIcon } from 'react-native-heroicons/outline';

import { api } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { haptics } from '../../../src/lib/haptics';
import { useAppTheme } from '../../../src/lib/theme';
import { Skeleton } from '../../../src/components/skeleton';
import { AppButton } from '../../../src/components/ui/button';
import {
  GroupCard,
  type GroupListItem,
} from '../../../src/components/groups/group-card';
import { usePullRefresh } from '../../../src/hooks/use-pull-refresh';

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

  const [sheetOpen, setSheetOpen] = useState(false);
  // Never hide an in-screen Modal and navigate in the same tick (racing
  // dismissal animations). Modal.onDismiss is iOS-only, so the route fires
  // from an effect after the sheet has left the tree on both platforms.
  const pendingRoute = useRef<'/groups/new' | '/join-by-code' | null>(null);
  const chooseRoute = (route: '/groups/new' | '/join-by-code') => {
    pendingRoute.current = route;
    setSheetOpen(false);
  };
  useEffect(() => {
    if (sheetOpen || pendingRoute.current === null) return;
    const task = InteractionManager.runAfterInteractions(() => {
      const route = pendingRoute.current;
      pendingRoute.current = null;
      if (route) router.push(route);
    });
    return () => task.cancel();
  }, [sheetOpen]);

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
          <Skeleton className="h-[76px] rounded-xl" />
          <Skeleton className="h-[76px] rounded-xl" />
          <Skeleton className="h-[76px] rounded-xl" />
        </View>
      </View>
    );
  }

  const groups = myGroups as GroupListItem[];
  const sorted = [...groups].sort((a, b) => {
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    const dueA = a.nextDueAt ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.nextDueAt ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return a.name.localeCompare(b.name);
  });

  const actionCount = groups.filter(
    (g) => g.myDue !== null || g.receiving !== null
  ).length;
  const summary = [
    t('groups.tab.circleCount', { count: groups.length }),
    actionCount > 0 ? t('groups.tab.actionsCount', { count: actionCount }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

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
          <View className="pb-sm">
            <View className="flex-row items-center justify-between">
              <Text className="font-heading text-display-lg text-foreground">
                {t('tabs.group')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('groups.tab.addAction')}
                onPress={() => {
                  haptics.select();
                  setSheetOpen(true);
                }}
                className="h-[40px] w-[40px] items-center justify-center rounded-full border border-border-subtle bg-surface active:bg-surface-muted"
              >
                <PlusIcon size={20} color={theme.text} />
              </Pressable>
            </View>
            {groups.length > 0 ? (
              <Text className="font-body text-body-sm text-muted">{summary}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-sm pt-xl">
            <View className="h-[56px] w-[56px] items-center justify-center rounded-full border border-border bg-surface">
              <UsersIcon size={26} color={theme.textMuted} />
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

      {/* Create/join chooser — colocated sheet; routes after dismissal */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="flex-1 justify-end bg-scrim"
          onPress={() => setSheetOpen(false)}
        >
          <Pressable
            className="gap-sm rounded-t-2xl bg-surface p-lg pb-xl"
            onPress={() => {}}
          >
            <Text className="font-body-semi text-title text-foreground">
              {t('groups.tab.addAction')}
            </Text>
            <AppButton
              label={t('groups.tab.create')}
              icon={<PlusIcon size={18} color={theme.primaryForeground} />}
              onPress={() => chooseRoute('/groups/new')}
            />
            <AppButton
              variant="outline"
              label={t('groups.tab.join')}
              icon={<KeyIcon size={18} color={theme.text} />}
              onPress={() => chooseRoute('/join-by-code')}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ListSeparator() {
  return <View className="h-sm" />;
}
