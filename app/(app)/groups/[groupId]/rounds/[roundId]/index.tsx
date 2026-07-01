import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../src/lib/convex-api';
import { useAuth } from '../../../../../../src/lib/clerk-client';
import { formatCurrencyXAF } from '../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../src/lib/idempotency';
import {
  buildRoundSummary,
  shareRoundSummary,
} from '../../../../../../src/lib/round-summary';
import { useAppTheme, useShadow } from '../../../../../../src/lib/theme';
import { TextField } from '../../../../../../src/components/ui/text-field';
import {
  Badge,
  PAYMENT_STATE_TONE,
  type PaymentState,
} from '../../../../../../src/components/ui/badge';
import { AppButton } from '../../../../../../src/components/ui/button';
import { Skeleton } from '../../../../../../src/components/skeleton';

/**
 * Round detail (docs/03 B4 entry, payment-features-plan Slice 1): pot
 * progress custody-captioned, the viewer's own cotisation row with the
 * « J'ai cotisé » cash claim, and every member's status chips (decision 6:
 * who-paid-who-when is visible to all). MoMo/OM pay flow is Slice 2.
 */
export default function RoundDetailScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
  }>();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();

  const queryArgs =
    isAuthenticated && roundId
      ? { roundId: roundId as Id<'rounds'> }
      : ('skip' as const);
  const round = useQuery(api.rounds.getRound, queryArgs);
  const rows = useQuery(api.rounds.listRoundPayments, queryArgs);
  const group = useQuery(
    api.groups.getGroup,
    isAuthenticated && groupId
      ? { groupId: groupId as Id<'groups'> }
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

  if (!isLoaded || round === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <View className="flex-row items-center gap-xs">
          <Skeleton className="h-[36px] w-[36px] rounded-md" />
          <Skeleton className="h-[26px] w-[160px]" />
        </View>
        <View className="mt-xl gap-lg">
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[220px] rounded-xl" />
        </View>
      </View>
    );
  }

  if (round === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background px-lg">
        <Text className="text-center font-body text-body text-muted">
          {t('round.notFound')}
        </Text>
        <AppButton
          variant="ghost"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    );
  }

  const dueDate = new Date(round.dueAt).toLocaleDateString(
    i18n.language === 'fr' ? 'fr-FR' : 'en-GB',
    { day: 'numeric', month: 'long' }
  );
  const myRow = rows?.find((r) => r.membershipId === round.viewerMembershipId);
  const isScheduled = round.status === 'scheduled';

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
            {t('round.title', { n: round.index })}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {t('round.beneficiary', { name: round.beneficiaryName })} ·{' '}
            {t('round.dueDate', { date: dueDate })}
          </Text>
        </View>
      </View>

      {/* Scheduled round — nothing claimable yet (a REAL state, not an error) */}
      {isScheduled ? (
        <SectionCard title={t('round.notOpenTitle')}>
          <Text className="font-body text-body-sm text-muted">
            {t('round.notOpenBody')}
          </Text>
        </SectionCard>
      ) : (
        <>
          {/* Meeting Mode — treasurer's roll-call entry (03 B6) */}
          {group?.viewerRole === 'treasurer' &&
          (round.status === 'open' || round.status === 'grace') ? (
            <AppButton
              className="mt-lg"
              label={t('meeting.openCta')}
              testID="open-meeting-mode"
              onPress={() =>
                router.push({
                  pathname: '/groups/[groupId]/rounds/[roundId]/meeting',
                  params: { groupId: round.groupId, roundId: round.roundId },
                })
              }
            />
          ) : null}

          {/* Pot — custody-captioned, never a bare balance (00 red line) */}
          <SectionCard title={t('round.potTitle')}>
            <PotProgress
              confirmedTotal={round.confirmedTotal}
              expectedTotal={round.expectedTotal}
              inFlightTotal={round.inFlightTotal}
              custodianName={round.custodianName}
            />
          </SectionCard>

          {/* My cotisation */}
          <SectionCard title={t('round.myRowTitle')}>
            {rows === undefined ? (
              <Skeleton className="h-[96px] rounded-md" />
            ) : myRow ? (
              <MyContributionBlock
                row={myRow}
                groupId={round.groupId}
                roundId={round.roundId}
              />
            ) : (
              <Text className="font-body text-body-sm text-muted">
                {t('round.noObligation')}
              </Text>
            )}
          </SectionCard>

          {/* Remise du pot (03 §F: never « payout »/« versement » in FR) */}
          {round.payout && round.collectionMode === 'via_treasurer' ? (
            <SectionCard title={t('payout.title')}>
              <PayoutBlock
                round={round}
                viewerRole={group?.viewerRole ?? null}
              />
            </SectionCard>
          ) : null}

          {/* Everyone's rows — chips only, read-only */}
          <SectionCard title={t('round.membersTitle')}>
            {rows === undefined ? (
              <View className="gap-sm">
                <Skeleton className="h-[48px] rounded-md" />
                <Skeleton className="h-[48px] rounded-md" />
              </View>
            ) : (
              rows.map((row, index) => (
                <View
                  key={row.membershipId}
                  className={
                    index > 0
                      ? 'border-t border-border-faint py-sm'
                      : 'py-sm'
                  }
                >
                  <MemberPaymentRow
                    row={row}
                    isMe={row.membershipId === round.viewerMembershipId}
                  />
                </View>
              ))
            )}
          </SectionCard>

          {/* WhatsApp summary — the distribution loop + feature-phone
              members' receipt (05 M10) */}
          {rows && group ? (
            <AppButton
              className="mt-lg"
              variant="outline"
              label={t('round.share')}
              testID="share-summary"
              onPress={() =>
                void shareRoundSummary(
                  buildRoundSummary(
                    i18n.language === 'en' ? 'en' : 'fr',
                    group.name,
                    round,
                    rows
                  )
                )
              }
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

type PaymentRow = FunctionReturnType<
  typeof api.rounds.listRoundPayments
>[number];

function PotProgress({
  confirmedTotal,
  expectedTotal,
  inFlightTotal,
  custodianName,
}: {
  confirmedTotal: number;
  expectedTotal: number;
  inFlightTotal: number;
  custodianName: string;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const pct =
    expectedTotal > 0
      ? Math.min(100, Math.round((confirmedTotal / expectedTotal) * 100))
      : 0;

  return (
    <View className="gap-xs">
      <Text className="font-body-semi text-body text-foreground">
        {t('round.pot.custody', {
          confirmed: formatCurrencyXAF(confirmedTotal),
          expected: formatCurrencyXAF(expectedTotal),
          name: custodianName,
        })}
      </Text>
      <View className="h-[8px] overflow-hidden rounded-pill bg-surface-muted">
        <View
          className="h-full rounded-pill"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </View>
      {inFlightTotal > 0 ? (
        <Text className="font-body text-caption text-muted">
          {t('round.inFlight', { amount: formatCurrencyXAF(inFlightTotal) })}
        </Text>
      ) : null}
    </View>
  );
}

function PaymentStateChip({ state }: { state: PaymentState }) {
  const { t } = useTranslation();
  const toneEntry = PAYMENT_STATE_TONE[state];
  return (
    <Badge
      tone={toneEntry.tone}
      label={`${toneEntry.icon} ${t(`payments.state.${state}`)}`}
    />
  );
}

/**
 * The viewer's own records + the « Je cotise » CTA on their pending record,
 * which opens the kind-aware pay flow (method picker → USSD → claim; cash
 * claims directly from the picker).
 */
function MyContributionBlock({
  row,
  groupId,
  roundId,
}: {
  row: PaymentRow;
  groupId: string;
  roundId: string;
}) {
  const { t } = useTranslation();
  const pendingRecord = row.records.find((r) => r.state === 'pending');

  return (
    <View className="gap-sm">
      {row.records.map((record) => (
        <View
          key={record.paymentRecordId}
          className="flex-row items-center justify-between gap-xs"
        >
          <View className="flex-row flex-wrap items-center gap-[6px]">
            <PaymentStateChip state={record.state} />
            {record.isArrears ? (
              <Badge tone="warning" label={t('round.arrears')} />
            ) : null}
            {record.method ? (
              <Text className="font-body text-caption text-muted">
                {t(`payments.method.${record.method}`)}
              </Text>
            ) : null}
          </View>
          <Text className="font-body-semi text-body-sm text-foreground">
            {formatCurrencyXAF(record.amount)}
          </Text>
        </View>
      ))}

      {row.isSettled ? (
        <Text className="font-body-medium text-body-sm text-success-dark">
          {t('round.settled')}
        </Text>
      ) : null}

      {pendingRecord ? (
        <AppButton
          label={t('round.claimCta')}
          testID="open-pay-flow"
          onPress={() =>
            router.push({
              pathname: '/groups/[groupId]/rounds/[roundId]/pay',
              params: {
                groupId,
                roundId,
                record: pendingRecord.paymentRecordId,
              },
            })
          }
        />
      ) : null}
    </View>
  );
}

type RoundDetail = NonNullable<
  FunctionReturnType<typeof api.rounds.getRound>
>;

/**
 * Remise du pot (docs/03 B6 / 05 M8). Two sides of the SAME handshake:
 * treasurer « Marquer le pot remis » claims payer-side with the amount
 * ENTERED at claim time (prefilled from the confirmed pot — the app
 * records what was actually handed over, never asserts); the beneficiary
 * « J'ai reçu le pot » claims payee-side. The counterparty (or the
 * president on behalf of a feature-phone beneficiary) confirms on the
 * per-payment screen. Confirm completes the round.
 */
function PayoutBlock({
  round,
  viewerRole,
}: {
  round: RoundDetail;
  viewerRole: 'president' | 'treasurer' | 'member' | null;
}) {
  const { t } = useTranslation();
  const claim = useMutation(api.paymentRecords.claim);
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const payout = round.payout;
  const viewerIsBeneficiary =
    round.beneficiaryMembershipId === round.viewerMembershipId;
  const viewerIsTreasurer = viewerRole === 'treasurer';

  // Prefill = confirmed pot (what is actually in hand), not the estimate.
  const prefill =
    round.confirmedTotal > 0 ? round.confirmedTotal : (payout?.amount ?? 0);
  const effectiveText = amountText ?? String(prefill);
  const amount = useMemo(() => {
    const parsed = Number(effectiveText.replace(/[\s.]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [effectiveText]);

  if (!payout) return null;

  const runClaim = async (withAmount?: number) => {
    setBusy(true);
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const result = await claim({
        paymentRecordId: payout.paymentRecordId as Id<'paymentRecords'>,
        idempotencyKey: keyRef.current,
        method: 'cash',
        ...(withAmount !== undefined && { amount: withAmount }),
      });
      haptics.success();
      toast.success(
        result.state === 'confirmed'
          ? t('payout.selfDone')
          : t('payout.claimed')
      );
      setEditing(false);
    } catch (err) {
      haptics.error();
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (payout.state === 'confirmed') {
    return (
      <Text className="font-body-semi text-body text-success-dark">
        {t('payout.done', {
          amount: formatCurrencyXAF(payout.amount),
          name: round.beneficiaryName,
        })}
      </Text>
    );
  }

  if (payout.state === 'claimed' || payout.state === 'disputed') {
    return (
      <View className="gap-sm">
        <View className="flex-row items-center justify-between">
          <PaymentStateChip state={payout.state} />
          <Text className="font-body-semi text-body text-foreground">
            {formatCurrencyXAF(payout.amount)}
          </Text>
        </View>
        <AppButton
          variant="outline"
          label={t('payout.view')}
          testID="payout-view"
          onPress={() =>
            router.push({
              pathname: '/payments/[paymentId]',
              params: { paymentId: payout.paymentRecordId },
            })
          }
        />
      </View>
    );
  }

  // pending — claim affordances by role
  if (viewerIsTreasurer) {
    return editing ? (
      <View className="gap-sm">
        <TextField
          label={t('payout.amountLabel', { name: round.beneficiaryName })}
          value={effectiveText}
          onChangeText={setAmountText}
          keyboardType="number-pad"
          testID="payout-amount"
        />
        <Text className="font-body text-caption text-muted">
          {t('payout.amountHint')}
        </Text>
        <View className="flex-row gap-sm">
          <AppButton
            className="flex-1"
            label={t('payout.claimCta')}
            loading={busy}
            disabled={busy || amount === null}
            testID="payout-claim"
            onPress={() => amount !== null && void runClaim(amount)}
          />
          <AppButton
            variant="ghost"
            label={t('common.cancel')}
            disabled={busy}
            onPress={() => setEditing(false)}
          />
        </View>
      </View>
    ) : (
      <AppButton
        label={t('payout.markCta')}
        testID="payout-mark"
        onPress={() => setEditing(true)}
      />
    );
  }

  if (viewerIsBeneficiary) {
    return (
      <AppButton
        label={t('payout.receivedCta')}
        loading={busy}
        disabled={busy}
        testID="payout-received"
        onPress={() => void runClaim()}
      />
    );
  }

  return (
    <Text className="font-body text-body-sm text-muted">
      {t('payout.waiting', { name: round.beneficiaryName })}
    </Text>
  );
}

function MemberPaymentRow({ row, isMe }: { row: PaymentRow; isMe: boolean }) {
  const { t } = useTranslation();
  // The member's "best" visible state: confirmed if settled, else the most
  // advanced record — chips per record would overload a 20-member list.
  const stateOrder: PaymentState[] = [
    'disputed',
    'confirmed',
    'claimed',
    'pending',
    'cancelled',
  ];
  const headline =
    stateOrder.find((s) => row.records.some((r) => r.state === s)) ?? 'pending';

  return (
    <View className="flex-row items-center justify-between gap-xs">
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-[6px]">
        <Text
          numberOfLines={1}
          className="shrink font-body-medium text-body-sm text-foreground"
        >
          {row.displayName}
        </Text>
        {isMe ? (
          <Text className="font-body-semi text-caption text-accent">
            ★ {t('groups.detail.you')}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-sm">
        <PaymentStateChip state={row.isSettled ? 'confirmed' : headline} />
        <Text className="font-body-semi text-body-sm text-foreground">
          {formatCurrencyXAF(row.confirmedAmount)}
          <Text className="font-body text-caption text-muted">
            {' '}
            / {formatCurrencyXAF(row.expectedAmount)}
          </Text>
        </Text>
      </View>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  const shadow = useShadow();
  return (
    <View
      className="mt-lg rounded-xl border border-border-subtle bg-surface p-lg"
      style={shadow('card')}
    >
      <Text className="pb-sm font-body-semi text-title text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
