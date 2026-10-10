import { memo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { ChevronLeftIcon, ChevronRightIcon } from 'react-native-heroicons/outline';
import { CheckCircleIcon } from 'react-native-heroicons/solid';

import { Skeleton } from '@/components/skeleton';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useAuth } from '@/lib/clerk-client';
import { api } from '@/lib/convex-api';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { useAppTheme } from '@/lib/theme';

type ConfirmItem = FunctionReturnType<typeof api.paymentRecords.myInbox>[number];

/**
 * One group's claims waiting on the viewer (Attention `confirmation_queue`).
 * Server truth only: a row leaves when the subscription drops it after a
 * confirm or dispute on the payment screen, never optimistically.
 */
export default function GroupConfirmationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const { refreshing, onRefresh } = usePullRefresh();

  const items = useQuery(
    api.paymentRecords.myInbox,
    isAuthenticated && groupId ? { groupId } : ('skip' as const)
  );

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || items === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <Skeleton className="h-[32px] w-[200px]" />
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[88px] rounded-xl" />
          <Skeleton className="h-[88px] rounded-xl" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={items}
        keyExtractor={(item) => item.paymentRecordId}
        renderItem={({ item }: ListRenderItemInfo<ConfirmItem>) => (
          <ConfirmRow item={item} />
        )}
        contentContainerStyle={screenPadding}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
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
                {t('confirmations.title')}
              </Text>
              {items.length > 0 ? (
                <Text className="font-body text-caption text-muted" numberOfLines={1}>
                  {items[0].groupName}
                </Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-md pt-xxl">
            <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-success-bg">
              <CheckCircleIcon size={40} color={theme.successDark} />
            </View>
            <Text className="text-center font-body-semi text-body text-foreground">
              {t('confirmations.emptyTitle')}
            </Text>
            <Text className="text-center font-body text-body-sm text-muted">
              {t('confirmations.emptyBody')}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

function RowSeparator() {
  return <View className="h-sm" />;
}

const ConfirmRow = memo(function ConfirmRow({ item }: { item: ConfirmItem }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const amount = formatCurrencyXAF(item.amount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('confirmations.rowLabel', {
        amount,
        name: item.counterpartyName,
      })}
      onPress={() =>
        router.push({
          pathname: '/payments/[paymentId]',
          params: { paymentId: item.paymentRecordId },
        })
      }
      className="flex-row items-center gap-sm rounded-xl border border-border-subtle bg-surface p-md active:bg-surface-muted"
    >
      <View className="min-w-0 flex-1 gap-[2px]">
        <Text className="font-body-semi text-body text-foreground">
          {item.counterpartyName} · {amount}
        </Text>
        <Text className="font-body text-body-sm text-muted" numberOfLines={1}>
          {[
            item.method ? t(`payments.method.${item.method}`) : null,
            item.reference || null,
            item.momoTxnId ? `ID ${item.momoTxnId}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text className="font-body text-caption text-muted">
          {item.claimedBySide === 'payer'
            ? t('inbox.claimedByPayer', { name: item.counterpartyName })
            : t('inbox.claimedByPayee', { name: item.counterpartyName })}
        </Text>
      </View>
      <ChevronRightIcon size={18} color={theme.textMuted} />
    </Pressable>
  );
});
