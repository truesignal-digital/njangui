import { RefreshControl, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { KeyIcon, PlusIcon, UsersIcon } from 'react-native-heroicons/outline';

import { api } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { useAppTheme } from '../../../src/lib/theme';
import { Skeleton } from '../../../src/components/skeleton';
import { AppButton } from '../../../src/components/ui/button';
import { GroupCard, type GroupListItem } from '../../../src/components/groups/group-card';
import { usePullRefresh } from '../../../src/hooks/use-pull-refresh';

/**
 * Home — Week 1 scope: my group list (docs/05 Week 1). The activity-feed /
 * group-pulse home (docs/03 B1) layers on in Weeks 4–5. Auth gating follows
 * piol mobile's screen-level pattern: queries pass 'skip' until
 * authenticated; signed-out users are redirected to sign-in.
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
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-[32px] w-[160px]" />
          <Skeleton className="h-[40px] w-[130px] rounded-md" />
        </View>
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[96px] rounded-xl" />
          <Skeleton className="h-[96px] rounded-xl" />
          <Skeleton className="h-[96px] rounded-xl" />
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
        keyExtractor={(group) => group.groupId}
        renderItem={({ item }: ListRenderItemInfo<GroupListItem>) => <GroupCard group={item} />}
        contentContainerStyle={{
          ...screenPadding,
          paddingHorizontal: theme.spacing.lg,
        }}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={<HomeHeader />}
        ListFooterComponent={<HomeFooter />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

function ListSeparator() {
  return <View className="h-sm" />;
}

function HomeHeader() {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <View className="flex-row items-center justify-between gap-sm pb-lg">
      <Text className="font-heading text-display-lg text-foreground">{t('home.heading')}</Text>
      <AppButton
        size="sm"
        label={t('home.createGroup')}
        icon={<PlusIcon size={16} color={theme.primaryForeground} />}
        onPress={() => router.push('/groups/new')}
      />
    </View>
  );
}

function HomeFooter() {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <View className="pt-md">
      <AppButton
        variant="ghost"
        label={t('home.haveLink')}
        icon={<KeyIcon size={18} color={theme.textMuted} />}
        onPress={() => router.push('/join-by-code')}
      />
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
