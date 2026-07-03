import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';

import { api } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { useAppTheme } from '../../../src/lib/theme';
import { Skeleton } from '../../../src/components/skeleton';
import {
  GroupCard,
  type GroupListItem,
} from '../../../src/components/groups/group-card';

/**
 * Groupe tab — minimal for now (payment-features-plan Slice 3: stub is
 * acceptable): my groups, active first, each card opening group detail.
 * The rich group switcher / pulse is a later cosmetic slice.
 */
export default function GroupTabScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const myGroups = useQuery(api.groups.listMyGroups, isAuthenticated ? {} : 'skip');

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
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[96px] rounded-xl" />
        </View>
      </View>
    );
  }

  const sorted = [...(myGroups as GroupListItem[])].sort((a, b) =>
    a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0
  );

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={sorted}
        keyExtractor={(group) => group.groupId}
        renderItem={({ item }: ListRenderItemInfo<GroupListItem>) => (
          <GroupCard group={item} />
        )}
        contentContainerStyle={screenPadding}
        ItemSeparatorComponent={() => <View className="h-sm" />}
        ListHeaderComponent={
          <Text className="pb-lg font-heading text-display-lg text-foreground">
            {t('tabs.group')}
          </Text>
        }
        ListEmptyComponent={
          <Text className="pt-xl text-center font-body text-body text-muted">
            {t('home.emptyTitle')}
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
