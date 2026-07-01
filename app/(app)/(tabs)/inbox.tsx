import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { ChevronRightIcon } from 'react-native-heroicons/outline';

import { api } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { formatCurrencyXAF } from '../../../src/lib/format-currency';
import { useAppTheme } from '../../../src/lib/theme';
import { Skeleton } from '../../../src/components/skeleton';

type InboxItem = FunctionReturnType<typeof api.paymentRecords.myInbox>[number];

/**
 * À confirmer (docs/03 B5): claims awaiting MY answer, cross-group. Each
 * row opens the per-payment screen where confirm / dispute live. This tab
 * is the objection window's guaranteed channel (03 §E) — push is layered
 * on top later, never instead.
 */
export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const inbox = useQuery(api.paymentRecords.myInbox, isAuthenticated ? {} : 'skip');

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || inbox === undefined) {
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
        data={inbox}
        keyExtractor={(item) => item.paymentRecordId}
        renderItem={({ item }: ListRenderItemInfo<InboxItem>) => (
          <InboxRow item={item} />
        )}
        contentContainerStyle={screenPadding}
        ItemSeparatorComponent={() => <View className="h-sm" />}
        ListHeaderComponent={
          <Text className="pb-lg font-heading text-display-lg text-foreground">
            {t('inbox.title', { count: inbox.length })}
          </Text>
        }
        ListEmptyComponent={
          <Text className="pt-xl text-center font-body text-body text-muted">
            {t('inbox.empty')}
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      testID={`inbox-row-${item.paymentRecordId}`}
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
          {item.counterpartyName} · {formatCurrencyXAF(item.amount)}
          {item.method ? ` · ${t(`payments.method.${item.method}`)}` : ''}
        </Text>
        <Text className="font-body text-body-sm text-muted" numberOfLines={1}>
          {item.groupName}
          {item.reference ? ` · ${item.reference}` : ''}
          {item.momoTxnId ? ` · ID ${item.momoTxnId}` : ''}
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
}
