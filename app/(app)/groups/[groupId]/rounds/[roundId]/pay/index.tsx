import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import {
  BanknotesIcon,
  ChevronRightIcon,
  DevicePhoneMobileIcon,
  InformationCircleIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../../src/lib/convex-api';
import { formatCurrencyXAF } from '../../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../../src/lib/idempotency';
import { useAppTheme } from '../../../../../../../src/lib/theme';
import { usePayFlow } from '../../../../../../../src/hooks/use-pay-flow';
import { AppButton } from '../../../../../../../src/components/ui/button';
import { Skeleton } from '../../../../../../../src/components/skeleton';

/**
 * Pay flow step 1 — method picker (docs/03 B4). Kind-aware via `?record=`.
 * MoMo/OM push the USSD instruction screen; Espèces skips USSD — bring the
 * cash to the réunion, with the optional « J'ai déjà remis » direct claim.
 */
export default function PayMethodScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId, record } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
    record?: string;
  }>();
  const flow = usePayFlow(roundId, record);
  const claim = useMutation(api.paymentRecords.claim);
  const [cashOpen, setCashOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const pushUssd = (method: 'momo_mtn' | 'orange_money') => {
    if (!flow.record) return;
    router.push({
      pathname: '/groups/[groupId]/rounds/[roundId]/pay/ussd',
      params: {
        groupId,
        roundId,
        record: flow.record.paymentRecordId,
        method,
      },
    });
  };

  const claimCash = async () => {
    if (!flow.record) return;
    setBusy(true);
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const result = await claim({
        paymentRecordId: flow.record.paymentRecordId as Id<'paymentRecords'>,
        idempotencyKey: keyRef.current,
        method: 'cash',
      });
      haptics.success();
      toast.success(
        result.state === 'confirmed'
          ? t('round.claimSelfSuccess')
          : t('round.claimSuccess')
      );
      close();
    } catch (err) {
      haptics.error();
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-heading text-title text-foreground">
          {flow.round
            ? t('pay.title', {
                n: flow.round.index,
                amount: flow.record ? formatCurrencyXAF(flow.record.amount) : '',
              })
            : t('pay.titleBare')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <XMarkIcon size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      {flow.loading ? (
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
        </View>
      ) : !flow.record ? (
        <Text className="mt-lg font-body text-body text-muted">
          {t('round.noObligation')}
        </Text>
      ) : (
        <View className="mt-lg gap-sm">
          <Text className="font-body text-body-sm text-muted">
            {t('pay.pickMethod')}
          </Text>

          <MethodCard
            icon={<DevicePhoneMobileIcon size={22} color={theme.accent} />}
            label={t('payments.method.momo_mtn')}
            onPress={() => pushUssd('momo_mtn')}
            testID="pay-momo"
          />
          <MethodCard
            icon={<DevicePhoneMobileIcon size={22} color={theme.accent} />}
            label={t('payments.method.orange_money')}
            onPress={() => pushUssd('orange_money')}
            testID="pay-orange"
          />
          <MethodCard
            icon={<BanknotesIcon size={22} color={theme.accent} />}
            label={t('pay.cash')}
            onPress={() => setCashOpen((open) => !open)}
            testID="pay-cash"
          />

          {cashOpen ? (
            <View className="gap-sm rounded-lg border border-border-subtle bg-surface p-md">
              <Text className="font-body text-body-sm text-foreground">
                {t('pay.cashBody', {
                  amount: formatCurrencyXAF(flow.record.amount),
                  name: flow.payee?.displayName ?? '—',
                })}
              </Text>
              <AppButton
                variant="outline"
                label={t('pay.cashClaimCta')}
                loading={busy}
                disabled={busy}
                onPress={() => void claimCash()}
                testID="pay-cash-claim"
              />
            </View>
          ) : null}

          <View className="mt-sm flex-row items-start gap-xs">
            <InformationCircleIcon size={16} color={theme.textMuted} />
            <Text className="flex-1 font-body text-body-sm text-muted">
              {t('pay.custodyNote', {
                name: flow.payee?.displayName ?? '—',
              })}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function MethodCard({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      className="min-h-cta flex-row items-center gap-sm rounded-lg border border-border bg-surface px-md active:bg-surface-muted"
    >
      {icon}
      <Text className="flex-1 font-body-semi text-body text-foreground">
        {label}
      </Text>
      <ChevronRightIcon size={18} color={theme.textMuted} />
    </Pressable>
  );
}
