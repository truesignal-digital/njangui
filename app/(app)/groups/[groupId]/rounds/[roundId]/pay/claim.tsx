import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../../src/lib/convex-api';
import { formatCurrencyXAF } from '../../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../../src/lib/idempotency';
import { useAppTheme } from '../../../../../../../src/lib/theme';
import { usePayFlow } from '../../../../../../../src/hooks/use-pay-flow';
import { AppButton } from '../../../../../../../src/components/ui/button';
import { TextField } from '../../../../../../../src/components/ui/text-field';
import { Skeleton } from '../../../../../../../src/components/skeleton';

/**
 * Pay flow step 3 — claim (docs/03 B4): amount prefilled with the remaining
 * obligation and EDITABLE (02 edge case 7 — under/over warns, never
 * blocks); txn ID is the nudged proof with a clipboard « Coller »;
 * « Déclarer sans preuve » stays allowed (decision 3). Confirmation — not
 * proof — is what makes the payment official (decision 2 microcopy).
 * Screenshot proof is deferred (needs an image picker — later slice).
 */
export default function PayClaimScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId, record, method } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
    record: string;
    method: 'momo_mtn' | 'orange_money';
  }>();
  const payMethod = method === 'orange_money' ? 'orange_money' : 'momo_mtn';
  const flow = usePayFlow(roundId, record);
  const claim = useMutation(api.paymentRecords.claim);

  const [amountText, setAmountText] = useState<string | null>(null); // null ⇒ prefill
  const [txnId, setTxnId] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const prefill = flow.record?.amount ?? 0;
  const effectiveAmountText = amountText ?? String(prefill);
  const amount = useMemo(() => {
    const parsed = Number(effectiveAmountText.replace(/[\s.]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [effectiveAmountText]);

  const warning =
    amount === null || !flow.record
      ? null
      : amount < flow.record.amount
        ? t('pay.partialWarning', {
            amount: formatCurrencyXAF(flow.record.amount - amount),
          })
        : amount > flow.record.amount
          ? t('pay.overWarning')
          : null;

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) {
      setTxnId(text);
      haptics.light();
    }
  };

  const submit = async (withProof: boolean) => {
    if (!flow.record) return;
    if (amount === null) {
      toast.error(t('pay.invalidAmount'));
      return;
    }
    setBusy(true);
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const trimmedTxn = txnId.trim();
      await claim({
        paymentRecordId: flow.record.paymentRecordId as Id<'paymentRecords'>,
        idempotencyKey: keyRef.current,
        amount,
        method: payMethod,
        ...(withProof && trimmedTxn ? { momoTxnId: trimmedTxn } : {}),
      });
      haptics.success();
      toast.success(
        t('pay.declared', { name: flow.payee?.displayName ?? '—' })
      );
      router.dismissTo({
        pathname: '/groups/[groupId]/rounds/[roundId]',
        params: { groupId, roundId },
      });
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
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center gap-xs">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="font-heading text-title text-foreground">
            {t('pay.claimTitle')}
          </Text>
          {flow.round ? (
            <Text className="font-body text-body-sm text-muted">
              {t('pay.claimContext', {
                method: t(`payments.method.${payMethod}`),
                name: flow.payee?.displayName ?? '—',
                n: flow.round.index,
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {flow.loading || !flow.record ? (
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[72px] rounded-lg" />
          <Skeleton className="h-[72px] rounded-lg" />
        </View>
      ) : (
        <View className="mt-lg gap-md">
          <View className="gap-xs">
            <TextField
              label={t('pay.amountSent')}
              value={effectiveAmountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              testID="claim-amount"
            />
            <Text className="font-body text-caption text-muted">
              {t('pay.amountPrefilled')}
            </Text>
            {warning ? (
              <Text className="font-body-medium text-body-sm text-warning-dark">
                {warning}
              </Text>
            ) : null}
          </View>

          <View className="gap-xs">
            <TextField
              label={`${t('pay.txnId')} ${t('pay.txnIdHint', {
                carrier: payMethod === 'momo_mtn' ? 'MTN' : 'Orange',
              })}`}
              value={txnId}
              onChangeText={setTxnId}
              placeholder={t('pay.txnPlaceholder')}
              autoCapitalize="characters"
              autoCorrect={false}
              testID="claim-txn-id"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void paste()}
              className="self-start rounded-md px-xs py-[2px] active:bg-surface-muted"
            >
              <Text className="font-body-medium text-body-sm text-accent">
                {t('pay.paste')}
              </Text>
            </Pressable>
          </View>

          <Text className="font-body text-body-sm text-muted">
            {t('pay.proofNote', { name: flow.payee?.displayName ?? '—' })}
          </Text>

          <AppButton
            label={t('pay.declareCta')}
            loading={busy}
            disabled={busy}
            onPress={() => void submit(true)}
            testID="claim-submit"
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void submit(false)}
            className="items-center py-xs"
            testID="claim-no-proof"
          >
            <Text className="font-body-medium text-body-sm text-muted underline">
              {t('pay.declareNoProof')}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
