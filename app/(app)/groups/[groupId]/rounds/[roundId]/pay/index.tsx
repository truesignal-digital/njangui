import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import {
  BanknotesIcon,
  DevicePhoneMobileIcon,
  InformationCircleIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';

import { api, type Id } from '@/lib/convex-api';
import { showErrorToast } from '@/lib/error-toast';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { MoneyText } from '@/components/ui/money-text';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useAppTheme } from '@/lib/theme';
import { usePayFlow } from '@/hooks/use-pay-flow';
import { AppButton } from '@/components/ui/button';
import { Skeleton } from '@/components/skeleton';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { ICON_SIZE } from '@/lib/icons';

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
  const [selectedMethod, setSelectedMethod] = useState<
    'momo_mtn' | 'orange_money' | 'cash' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const methodHint = (method: 'momo_mtn' | 'orange_money'): string | null => {
    const availability = flow.methodAvailability[method];
    if (availability.available) return null;
    const name = flow.payee?.displayName ?? t('pay.recipientFallback');
    if (availability.reason === 'missing_phone') {
      return t('pay.unavailable.missingPhone', { name });
    }
    if (availability.reason === 'operator_mismatch' && flow.suggestedMethod) {
      return t('pay.unavailable.wrongOperator', {
        name,
        method: t(`payments.method.${flow.suggestedMethod}`),
      });
    }
    return t('pay.unavailable.noMobileMoney', {
      name,
      method: t(`payments.method.${method}`),
    });
  };

  const pushUssd = (method: 'momo_mtn' | 'orange_money') => {
    if (!flow.record || !flow.methodAvailability[method].available) return;
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
      showErrorToast(err, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Plain View, not ScrollView: the route presents as a formSheet with
    // fitToContents, which needs an intrinsic content height to measure.
    <View
      className="bg-background"
      style={{
        paddingTop: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-body-semi text-overline uppercase text-success-dark">
          {t('pay.recordContribution')}
        </Text>
        <SoftPressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          className="h-[44px] w-[44px] items-center justify-center rounded-full active:bg-surface-muted"
        >
          <XMarkIcon size={ICON_SIZE.control} color={theme.textMuted} />
        </SoftPressable>
      </View>

      {flow.round && flow.record ? (
        <View
          className="mt-sm bg-success-bg p-md"
          style={{
            borderTopLeftRadius: 28,
            borderTopRightRadius: 10,
            borderBottomRightRadius: 28,
            borderBottomLeftRadius: 10,
            borderCurve: 'continuous',
          }}
        >
          <Text className="font-body-semi text-overline uppercase text-success-dark">
            {t('pay.roundEyebrow', { n: flow.round.index })}
          </Text>
          <MoneyText selectable size="hero" className="pt-xs">
            {formatCurrencyXAF(flow.record.amount)}
          </MoneyText>
          <Text className="font-heading text-title-lg text-foreground">
            {t('pay.yourContribution')}
          </Text>
          {flow.payee ? (
            <Text className="pt-[2px] font-body text-caption text-muted">
              {t('pay.directTo', { name: flow.payee.displayName })}
            </Text>
          ) : null}
        </View>
      ) : null}

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
            icon={
              <DevicePhoneMobileIcon
                size={22}
                color={
                  flow.methodAvailability.momo_mtn.available
                    ? theme.accent
                    : theme.textMuted
                }
              />
            }
            label={t('payments.method.momo_mtn')}
            hint={methodHint('momo_mtn')}
            disabled={!flow.methodAvailability.momo_mtn.available}
            selected={selectedMethod === 'momo_mtn'}
            onPress={() => setSelectedMethod('momo_mtn')}
            testID="pay-momo"
          />
          <MethodCard
            icon={
              <DevicePhoneMobileIcon
                size={22}
                color={
                  flow.methodAvailability.orange_money.available
                    ? theme.accent
                    : theme.textMuted
                }
              />
            }
            label={t('payments.method.orange_money')}
            hint={methodHint('orange_money')}
            disabled={!flow.methodAvailability.orange_money.available}
            selected={selectedMethod === 'orange_money'}
            onPress={() => setSelectedMethod('orange_money')}
            testID="pay-orange"
          />
          <MethodCard
            icon={<BanknotesIcon size={22} color={theme.accent} />}
            label={t('pay.cash')}
            selected={selectedMethod === 'cash'}
            onPress={() => setSelectedMethod('cash')}
            testID="pay-cash"
          />

          {selectedMethod === 'cash' ? (
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

          {selectedMethod === 'momo_mtn' ||
          selectedMethod === 'orange_money' ? (
            <AppButton
              label={t('pay.continue')}
              onPress={() => pushUssd(selectedMethod)}
              testID="pay-method-continue"
            />
          ) : null}

          <View className="mt-sm flex-row items-start gap-xs">
            <InformationCircleIcon size={16} color={theme.textMuted} />
            <Text className="flex-1 font-body text-body-sm text-muted">
              {t('pay.custodyNoteNeutral')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function MethodCard({
  icon,
  label,
  hint,
  disabled = false,
  selected = false,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string | null;
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      testID={testID}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      className={`min-h-[56px] flex-row items-center gap-sm rounded-2xl border px-sm py-xs ${
        disabled
          ? 'border-border bg-surface-muted'
          : selected
            ? 'border-success bg-success-bg'
            : 'border-border bg-surface active:bg-surface-muted'
      }`}
    >
      <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-success-bg">
        {icon}
      </View>
      <View className="flex-1 gap-1">
        <Text
          className={`font-body-semi text-body ${
            disabled ? 'text-muted' : 'text-foreground'
          }`}
        >
          {label}
        </Text>
        {hint ? (
          <Text className="font-body text-body-sm text-muted">{hint}</Text>
        ) : null}
      </View>
      {disabled ? null : (
        <View
          className={`h-[18px] w-[18px] items-center justify-center rounded-full border ${
            selected ? 'border-success-dark' : 'border-success'
          }`}
        >
          {selected ? (
            <View className="h-[10px] w-[10px] rounded-full bg-success-dark" />
          ) : null}
        </View>
      )}
    </SoftPressable>
  );
}
