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
import { showErrorToast } from '../../../src/lib/error-toast';
import { formatCurrencyXAF } from '../../../src/lib/format-currency';
import { formatDateTime } from '../../../src/lib/format-date';
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
 * (confirm guarded), « Retirer ma déclaration » for the claimant, and an
 * auditable president-only correction for a mistaken confirmed entry.
 */
export default function PaymentDetailScreen() {
  const { t, i18n } = useTranslation();
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
      {/* One record, not an account balance: amount + people + state. */}
      <View
        className="bg-success-bg p-md"
        style={{
          borderTopLeftRadius: 28,
          borderTopRightRadius: 10,
          borderBottomRightRadius: 28,
          borderBottomLeftRadius: 10,
          borderCurve: 'continuous',
        }}
      >
        <View className="flex-row items-start gap-xs">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/')
            }
            className="h-[40px] w-[40px] items-center justify-center rounded-full bg-surface active:bg-surface-muted"
          >
            <ChevronLeftIcon size={22} color={theme.textMuted} />
          </Pressable>
          <View className="min-w-0 flex-1 gap-[3px]">
            <Text className="font-body-semi text-overline uppercase text-success-dark">
              {record.groupName}
            </Text>
            <Text selectable className="font-heading text-display-lg text-foreground">
              {formatCurrencyXAF(record.amount)}
            </Text>
            <Text className="font-heading text-title-lg text-foreground">
              {t(`payment.kind.${record.kind}`)}
            </Text>
            <Text className="font-body text-caption text-muted">
              {record.payerName} → {record.payeeName}
            </Text>
            <View className="self-start pt-xs">
              <PaymentStateBadge
                state={record.state as PaymentState}
                label={t(`payments.state.${record.state}`)}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Owner + next transition — the answer to “what happens now?” leads;
          raw ledger metadata stays in the Details card below. */}
      <StatusBlock record={record} />

      {/* Facts */}
      <Card>
        <FactRow
          label={t('payment.group')}
          value={
            record.roundIndex !== null
              ? `${record.groupName} · ${t('round.title', { n: record.roundIndex })}`
              : record.groupName
          }
        />
        <FactRow label={t('payment.payer')} value={record.payerName} />
        <FactRow label={t('payment.payee')} value={record.payeeName} />
        {record.method ? (
          <FactRow
            label={t('payment.method')}
            value={capitalize(t(`payments.method.${record.method}`))}
          />
        ) : null}
        <FactRow label={t('pay.reference')} value={record.reference} />
        {record.momoTxnId ? (
          <FactRow label={t('pay.txnId')} value={record.momoTxnId} />
        ) : null}
        {record.claimedAt ? (
          <FactRow
            label={t('payment.claimedAt')}
            value={formatDateTime(record.claimedAt, i18n.language)}
          />
        ) : null}
        {record.confirmedAt ? (
          <FactRow
            label={t('payment.confirmedAt')}
            value={formatDateTime(record.confirmedAt, i18n.language)}
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

      {record.corrections.length > 0 ? (
        <Card>
          <Text className="font-body-semi text-body text-destructive-dark">
            {t('payment.correctionHistory')}
          </Text>
          {record.corrections.map((correction) => (
            <View
              key={`${correction.createdAt}-${correction.presidentName}`}
              className="mt-sm rounded-lg bg-destructive-bg p-sm"
            >
              <Text className="font-body-semi text-body-sm text-foreground">
                {t('payment.correctedBy', { name: correction.presidentName })}
              </Text>
              <Text className="pt-[2px] font-body text-caption text-muted">
                {formatDateTime(correction.createdAt, i18n.language)}
              </Text>
              <Text className="pt-xs font-body text-body-sm text-foreground">
                « {correction.note} »
              </Text>
            </View>
          ))}
          <Text className="pt-sm font-body text-caption text-muted">
            {t('payment.correctionHistoryNote')}
          </Text>
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

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

const STATUS_TONE_CLASSES = {
  accent: 'border-accent bg-accent-light',
  warning: 'border-warning-dark bg-warning-bg',
  success: 'border-success bg-success-bg',
  neutral: 'border-border-subtle bg-surface',
} as const;

/** Who owns the next step, in one sentence — before any ledger metadata. */
function StatusBlock({ record }: { record: RecordDetail }) {
  const { t } = useTranslation();
  const shadow = useShadow();

  // The side that did NOT record the claim is the one whose answer counts.
  const confirmerName =
    record.claimedBySide === 'payer' ? record.payeeName : record.payerName;

  let title: string;
  let body: string;
  let tone: keyof typeof STATUS_TONE_CLASSES;
  switch (record.state) {
    case 'claimed':
      if (record.viewerCanConfirm) {
        title = t('payment.status.needsYouTitle');
        body = t('payment.status.needsYouBody');
        tone = 'accent';
      } else {
        title = t('payment.status.waitingTitle', { name: confirmerName });
        body = t('payment.status.waitingBody', { name: confirmerName });
        tone = 'neutral';
      }
      break;
    case 'disputed':
      title = t('payment.status.disputedTitle');
      body =
        record.viewerIsClaimant && record.viewerCanCancel
          ? t('payment.status.disputedYoursBody', { name: confirmerName })
          : t('payment.status.disputedBody', {
              payer: record.payerName,
              payee: record.payeeName,
            });
      tone = 'warning';
      break;
    case 'confirmed':
      title = t('payment.status.confirmedTitle');
      body = t('payment.status.confirmedBody');
      tone = 'success';
      break;
    case 'cancelled':
      title = t('payment.status.cancelledTitle');
      body = t('payment.status.cancelledBody');
      tone = 'neutral';
      break;
    default:
      title = t('payment.status.pendingTitle');
      body = t('payment.status.pendingBody');
      tone = 'neutral';
  }

  return (
    <View
      className={`mt-md gap-xs rounded-2xl border p-md ${STATUS_TONE_CLASSES[tone]}`}
      style={shadow('card')}
    >
      <Text className="font-body-semi text-body text-foreground">{title}</Text>
      <Text className="font-body text-body-sm text-muted">{body}</Text>
    </View>
  );
}

function PaymentActions({ record }: { record: RecordDetail }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const confirm = useMutation(api.paymentRecords.confirm);
  const dispute = useMutation(api.paymentRecords.dispute);
  const cancel = useMutation(api.paymentRecords.cancel);

  const [mode, setMode] = useState<
    'idle' | 'confirming' | 'disputing' | 'cancelling' | 'correcting'
  >('idle');
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
      showErrorToast(err, t);
    } finally {
      setBusy(false);
    }
  };

  if (record.state === 'confirmed' && record.viewerCanCorrect) {
    return (
      <Card>
        {mode === 'idle' ? (
          <AppButton
            variant="outline"
            label={t('payment.correctCta')}
            testID="payment-correct"
            onPress={() => {
              setNote('');
              setMode('correcting');
            }}
          />
        ) : (
          <View className="gap-sm">
            <Text className="font-heading text-title text-foreground">
              {t('payment.correctTitle')}
            </Text>
            <Text className="font-body text-body-sm text-muted">
              {t('payment.correctBody')}
            </Text>
            <View className="rounded-lg bg-success-bg p-sm">
              <Text className="font-body-semi text-body-sm text-foreground">
                {t('payment.correctDueAgain', {
                  amount: formatCurrencyXAF(record.amount),
                })}
              </Text>
              <Text className="pt-[2px] font-body text-caption text-muted">
                {t('payment.correctConfirmationPreserved')}
              </Text>
            </View>
            <TextField
              label={t('payment.correctReason')}
              value={note}
              onChangeText={setNote}
              placeholder={t('payment.correctReasonPlaceholder')}
            />
            <AppButton
              variant="destructive"
              label={t('payment.correctSubmit')}
              loading={busy}
              disabled={busy || note.trim().length < 10}
              testID="payment-correct-submit"
              onPress={() =>
                void run(
                  () =>
                    cancel({
                      paymentRecordId: record.paymentRecordId,
                      note: note.trim(),
                    }),
                  'payment.corrected'
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
        )}
      </Card>
    );
  }

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
      className="mt-md rounded-2xl border border-border-subtle bg-surface p-md"
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
