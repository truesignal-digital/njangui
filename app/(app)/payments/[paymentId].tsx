import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';
import { CheckCircleIcon } from 'react-native-heroicons/solid';

import { api, type Id } from '../../../src/lib/convex-api';
import { useAuth } from '../../../src/lib/clerk-client';
import { formatCurrencyXAF } from '../../../src/lib/format-currency';
import { haptics } from '../../../src/lib/haptics';
import { useAppTheme, useShadow } from '../../../src/lib/theme';
import {
  PaymentStateBadge,
  type PaymentState,
} from '../../../src/components/ui/badge';
import { AppButton } from '../../../src/components/ui/button';
import { TextField } from '../../../src/components/ui/text-field';
import { Skeleton } from '../../../src/components/skeleton';
import { ImagePreviewModal } from '../../../src/components/image-preview-modal';

type DisputeReason = 'not_received' | 'wrong_amount' | 'other';

/**
 * Per-payment screen (docs/03 B5/B7) — THE deep-link target for inbox rows,
 * pushes, and feed entries. Backed by getPaymentRecord, so it renders any
 * state (a push can land on a record no longer in any inbox). Actions are
 * viewer-relative: « C'est exact ✓ » / « Contester » for the counterparty
 * (confirm guarded — it is IRREVERSIBLE: no confirmed→cancelled path
 * exists), « Retirer ma déclaration » for the claimant.
 */
export default function PaymentDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const record = useQuery(
    api.paymentRecords.getPaymentRecord,
    isAuthenticated && paymentId
      ? { paymentRecordId: paymentId as Id<'paymentRecords'> }
      : ('skip' as const)
  );

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || record === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <Skeleton className="h-[32px] w-[220px]" />
        <View className="mt-lg gap-lg">
          <Skeleton className="h-[160px] rounded-xl" />
          <Skeleton className="h-[120px] rounded-xl" />
        </View>
      </View>
    );
  }

  if (record === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background px-lg">
        <Text className="text-center font-body text-body text-muted">
          {t('payment.notFound')}
        </Text>
        <AppButton
          variant="ghost"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={screenPadding}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-start gap-xs">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="mt-[2px] h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <View className="min-w-0 flex-1 gap-xs">
          <Text className="font-heading text-headline text-foreground">
            {t(`payment.kind.${record.kind}`)} · {formatCurrencyXAF(record.amount)}
          </Text>
          <PaymentStateBadge
            state={record.state as PaymentState}
            label={t(`payments.state.${record.state}`)}
          />
        </View>
      </View>

      {/* Facts */}
      <Card>
        <FactRow label={t('payment.group')} value={record.groupName} />
        {record.roundIndex !== null ? (
          <FactRow
            label={t('round.title', { n: record.roundIndex })}
            value={record.reference}
          />
        ) : null}
        <FactRow label={t('payment.payer')} value={record.payerName} />
        <FactRow label={t('payment.payee')} value={record.payeeName} />
        {record.method ? (
          <FactRow
            label={t('payment.method')}
            value={t(`payments.method.${record.method}`)}
          />
        ) : null}
        {record.momoTxnId ? (
          <FactRow label={t('pay.txnId')} value={record.momoTxnId} />
        ) : null}
        {record.claimedAt ? (
          <FactRow
            label={t('payment.claimedAt')}
            value={new Date(record.claimedAt).toLocaleString()}
          />
        ) : null}
        {record.confirmedAt ? (
          <FactRow
            label={t('payment.confirmedAt')}
            value={new Date(record.confirmedAt).toLocaleString()}
          />
        ) : null}
      </Card>

      {/* Proof photo — shown to the confirmer; accepted, never trusted (I-10) */}
      {record.screenshotUrl ? (
        <Card>
          <Text className="pb-xs font-body-semi text-body text-foreground">
            {t('payment.proofImage')}
          </Text>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('payment.proofImageOpen')}
            onPress={() => setPreviewUri(record.screenshotUrl)}
          >
            <Image
              source={{ uri: record.screenshotUrl }}
              resizeMode="contain"
              style={{
                height: 320,
                width: '100%',
                borderRadius: theme.radius.lg,
                backgroundColor: theme.surfaceMuted,
              }}
              accessibilityLabel={t('payment.proofImage')}
            />
          </Pressable>
          <Text className="pt-xs font-body text-caption text-muted">
            {t('payment.proofImageTapHint')} ·{' '}
            {t('payment.proofImageNote')}
          </Text>
        </Card>
      ) : null}

      <ImagePreviewModal
        uri={previewUri}
        onClose={() => setPreviewUri(null)}
      />

      {/* Dispute thread */}
      {record.dispute ? (
        <Card>
          <Text className="pb-xs font-body-semi text-body text-foreground">
            {t('payment.disputeTitle')}
          </Text>
          <Text className="font-body text-body-sm text-foreground">
            {record.dispute.autoOpened
              ? t('payment.disputeAuto')
              : t('payment.disputeBy', {
                  name: record.dispute.openedByName ?? '—',
                })}
            {record.dispute.reason
              ? ` · ${t(`payment.disputeReason.${record.dispute.reason}`)}`
              : ''}
          </Text>
          {record.dispute.reasonNote ? (
            <Text className="pt-xs font-body text-body-sm text-muted">
              « {record.dispute.reasonNote} »
            </Text>
          ) : null}
          {record.dispute.resolutionNote ? (
            <Text className="pt-xs font-body text-body-sm text-muted">
              {t('payment.resolution')} : {record.dispute.resolutionNote}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {/* Actions */}
      <PaymentActions record={record} />
    </ScrollView>
  );
}

type RecordDetail = NonNullable<
  FunctionReturnType<typeof api.paymentRecords.getPaymentRecord>
>;

function PaymentActions({ record }: { record: RecordDetail }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const confirm = useMutation(api.paymentRecords.confirm);
  const dispute = useMutation(api.paymentRecords.dispute);
  const cancel = useMutation(api.paymentRecords.cancel);

  const [mode, setMode] = useState<'idle' | 'confirming' | 'disputing' | 'cancelling'>('idle');
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, successKey: string) => {
    setBusy(true);
    try {
      await fn();
      haptics.success();
      toast.success(t(successKey));
      setMode('idle');
    } catch (err) {
      haptics.error();
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (record.state === 'claimed' && (record.viewerCanConfirm || record.viewerCanCancel)) {
    return (
      <Card>
        {mode === 'idle' ? (
          <View className="gap-sm">
            {record.viewerCanConfirm ? (
              <>
                <AppButton
                  label={t('payment.confirmCta')}
                  icon={<CheckCircleIcon size={18} color={theme.primaryForeground} />}
                  testID="payment-confirm"
                  onPress={() => setMode('confirming')}
                />
                <AppButton
                  variant="outline"
                  label={t('payment.disputeCta')}
                  testID="payment-dispute"
                  onPress={() => setMode('disputing')}
                />
              </>
            ) : null}
            {record.viewerCanCancel ? (
              <AppButton
                variant="ghost"
                label={t('payment.cancelCta')}
                testID="payment-cancel"
                onPress={() => setMode('cancelling')}
              />
            ) : null}
          </View>
        ) : mode === 'confirming' ? (
          <View className="gap-sm">
            {/* Irreversibility guard — confirmed is ledger-final, no undo path */}
            <Text className="font-body text-body-sm text-foreground">
              {t('payment.confirmGuard', {
                amount: formatCurrencyXAF(record.amount),
                name: record.payerName,
              })}
            </Text>
            <View className="flex-row gap-sm">
              <AppButton
                label={t('payment.confirmSure')}
                loading={busy}
                disabled={busy}
                className="flex-1"
                testID="payment-confirm-sure"
                onPress={() =>
                  void run(
                    () =>
                      confirm({
                        paymentRecordId: record.paymentRecordId,
                        channel: 'app',
                        ...(record.viewerCanConfirm && !record.viewerIsCounterparty
                          ? { note: t('payment.onBehalfNote') }
                          : {}),
                      }),
                    'payment.confirmed'
                  )
                }
              />
              <AppButton
                variant="ghost"
                label={t('common.cancel')}
                disabled={busy}
                onPress={() => setMode('idle')}
              />
            </View>
          </View>
        ) : mode === 'disputing' ? (
          <View className="gap-sm">
            <Text className="font-body-semi text-body text-foreground">
              {t('payment.disputeWhy')}
            </Text>
            {(['not_received', 'wrong_amount', 'other'] as const).map((r) => (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === r }}
                onPress={() => setReason(r)}
                className={
                  reason === r
                    ? 'min-h-[44px] flex-row items-center rounded-lg border border-accent bg-accent-faint px-md'
                    : 'min-h-[44px] flex-row items-center rounded-lg border border-border bg-surface px-md'
                }
              >
                {reason === r ? (
                  <CheckCircleIcon size={18} color={theme.accent} />
                ) : (
                  <View className="h-[16px] w-[16px] rounded-full border-2 border-placeholder" />
                )}
                <Text className="pl-xs font-body-medium text-body-sm text-foreground">
                  {t(`payment.disputeReason.${r}`)}
                </Text>
              </Pressable>
            ))}
            <TextField
              label={t('payment.disputeNote')}
              value={note}
              onChangeText={setNote}
              placeholder={t('payment.disputeNotePlaceholder')}
            />
            <View className="flex-row gap-sm">
              <AppButton
                label={t('payment.disputeSubmit')}
                loading={busy}
                disabled={busy || reason === null}
                className="flex-1"
                testID="payment-dispute-submit"
                onPress={() =>
                  reason &&
                  void run(
                    () =>
                      dispute({
                        paymentRecordId: record.paymentRecordId,
                        reason,
                        ...(note.trim() ? { note: note.trim() } : {}),
                      }),
                    'payment.disputed'
                  )
                }
              />
              <AppButton
                variant="ghost"
                label={t('common.cancel')}
                disabled={busy}
                onPress={() => setMode('idle')}
              />
            </View>
          </View>
        ) : (
          <View className="gap-sm">
            <Text className="font-body text-body-sm text-foreground">
              {t('payment.cancelGuard')}
            </Text>
            <View className="flex-row gap-sm">
              <AppButton
                label={t('payment.cancelSure')}
                loading={busy}
                disabled={busy}
                className="flex-1"
                testID="payment-cancel-sure"
                onPress={() =>
                  void run(
                    () => cancel({ paymentRecordId: record.paymentRecordId }),
                    'payment.cancelled'
                  )
                }
              />
              <AppButton
                variant="ghost"
                label={t('common.cancel')}
                disabled={busy}
                onPress={() => setMode('idle')}
              />
            </View>
          </View>
        )}
      </Card>
    );
  }

  if (record.state === 'disputed' && record.viewerCanCancel) {
    return (
      <Card>
        <AppButton
          variant="outline"
          label={t('payment.withdrawFromDispute')}
          loading={busy}
          disabled={busy}
          onPress={() =>
            void run(
              () => cancel({ paymentRecordId: record.paymentRecordId }),
              'payment.cancelled'
            )
          }
        />
      </Card>
    );
  }

  return null;
}

function Card({ children }: { children: ReactNode }) {
  const shadow = useShadow();
  return (
    <View
      className="mt-lg rounded-xl border border-border-subtle bg-surface p-lg"
      style={shadow('card')}
    >
      {children}
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-sm py-[3px]">
      <Text className="font-body text-body-sm text-muted">{label}</Text>
      <Text className="shrink text-right font-body-medium text-body-sm text-foreground">
        {value}
      </Text>
    </View>
  );
}
