import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../src/lib/convex-api';
import { formatCurrencyXAF } from '../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../src/lib/idempotency';
import {
  dequeueTap,
  enqueueTap,
  loadQueue,
} from '../../../../../../src/lib/meeting-queue';
import { useAppTheme } from '../../../../../../src/lib/theme';
import { AppButton } from '../../../../../../src/components/ui/button';
import { Badge } from '../../../../../../src/components/ui/badge';
import { TextField } from '../../../../../../src/components/ui/text-field';
import { Skeleton } from '../../../../../../src/components/skeleton';

type PaymentRow = FunctionReturnType<
  typeof api.rounds.listRoundPayments
>[number];

/**
 * Meeting Mode (docs/03 B6, 05 M6) — treasurer roll-call, full-screen,
 * keep-awake. Tap = payee-side cash claim on the member's pending record
 * (≤100 ms optimistic feedback); a payer-claimed row CONFIRMS the existing
 * record — never a duplicate; ↩ withdraws my own claim (the only legal
 * undo); long-press edits the amount (partial → arrears split at claim).
 * Every tap is persisted to the AsyncStorage queue BEFORE the mutation and
 * replayed idempotently after an app kill.
 */
export default function MeetingModeScreen() {
  useKeepAwake();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
  }>();
  const { isAuthenticated } = useConvexAuth();

  const queryArgs =
    isAuthenticated && roundId
      ? { roundId: roundId as Id<'rounds'> }
      : ('skip' as const);
  const round = useQuery(api.rounds.getRound, queryArgs);
  const rows = useQuery(api.rounds.listRoundPayments, queryArgs);
  const claim = useMutation(api.paymentRecords.claim);
  const confirm = useMutation(api.paymentRecords.confirm);
  const cancel = useMutation(api.paymentRecords.cancel);

  // Optimistic row states — set the instant a tap lands, cleared when the
  // server row catches up (reactive query re-render supersedes them).
  const [optimistic, setOptimistic] = useState<
    Record<string, 'claimed' | 'confirmed'>
  >({});
  const [pendingSync, setPendingSync] = useState(0);
  const [editing, setEditing] = useState<{
    recordId: string;
    memberName: string;
    amountText: string;
  } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const keysRef = useRef(new Map<string, string>());

  const refreshPendingCount = useCallback(async () => {
    if (!roundId) return;
    const queue = await loadQueue(roundId);
    setPendingSync(queue.length);
  }, [roundId]);

  // Replay the durable queue on mount — taps lost to an app kill re-fire
  // with their ORIGINAL keys (server no-ops the ones that landed).
  useEffect(() => {
    if (!roundId || !isAuthenticated) return;
    let live = true;
    void (async () => {
      const queue = await loadQueue(roundId);
      if (!live) return;
      setPendingSync(queue.length);
      for (const tap of queue) {
        try {
          if (tap.action === 'claim') {
            await claim({
              paymentRecordId: tap.recordId as Id<'paymentRecords'>,
              idempotencyKey: tap.idempotencyKey,
              method: 'cash',
              ...(tap.amount !== undefined && { amount: tap.amount }),
            });
          } else {
            await confirm({
              paymentRecordId: tap.recordId as Id<'paymentRecords'>,
              channel: 'meeting',
            });
          }
          await dequeueTap(roundId, tap.idempotencyKey);
        } catch (err) {
          // A terminal server verdict (state moved on) is a resolved tap;
          // a network failure keeps it queued for the next replay.
          if (err instanceof Error && !/network|fetch/i.test(err.message)) {
            await dequeueTap(roundId, tap.idempotencyKey);
          }
        }
      }
      if (live) await refreshPendingCount();
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, isAuthenticated]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const settled = rows.filter((r) => r.isSettled).length;
    const confirmedSum = rows.reduce((sum, r) => sum + r.confirmedAmount, 0);
    const inFlightSum = rows.reduce((sum, r) => sum + r.inFlightAmount, 0);
    return { settled, total: rows.length, confirmedSum, inFlightSum };
  }, [rows]);

  if (!roundId || !groupId) return null;

  const runTap = async (row: PaymentRow, amountOverride?: number) => {
    const pending = row.records.find((r) => r.state === 'pending');
    const claimed = row.records.find((r) => r.state === 'claimed');
    const disputed = row.records.find((r) => r.state === 'disputed');

    if (disputed) {
      router.push({
        pathname: '/payments/[paymentId]',
        params: { paymentId: disputed.paymentRecordId },
      });
      return;
    }

    // ≤100 ms feedback: optimistic state + haptic fire before the network.
    haptics.light();

    if (pending) {
      const recordId = pending.paymentRecordId;
      let key = keysRef.current.get(recordId);
      if (!key) {
        key = newIdempotencyKey();
        keysRef.current.set(recordId, key);
      }
      setOptimistic((o) => ({ ...o, [row.membershipId]: 'claimed' }));
      await enqueueTap(roundId, {
        recordId,
        idempotencyKey: key,
        action: 'claim',
        amount: amountOverride,
        queuedAt: Date.now(),
      });
      void refreshPendingCount();
      try {
        await claim({
          paymentRecordId: recordId as Id<'paymentRecords'>,
          idempotencyKey: key,
          method: 'cash',
          ...(amountOverride !== undefined && { amount: amountOverride }),
        });
        await dequeueTap(roundId, key);
      } catch (err) {
        if (err instanceof Error && /already/i.test(err.message)) {
          // Meeting-Mode collision (the member claimed payer-side while we
          // tapped): resolve by confirming their record instead.
          await dequeueTap(roundId, key);
          setOptimistic((o) => {
            const { [row.membershipId]: _drop, ...rest } = o;
            return rest;
          });
          toast(t('meeting.collision'));
        } else if (err instanceof Error && !/network|fetch/i.test(err.message)) {
          await dequeueTap(roundId, key);
          setOptimistic((o) => {
            const { [row.membershipId]: _drop, ...rest } = o;
            return rest;
          });
          haptics.error();
          toast.error(err.message);
        }
        // network errors: stays queued, optimistic state stands
      } finally {
        keysRef.current.delete(recordId);
        void refreshPendingCount();
      }
      return;
    }

    if (claimed) {
      if (claimed.claimedBySide === 'payee') {
        // My own roll-call tick — ↩ withdraw (claimed→cancelled→fresh pending).
        try {
          await cancel({
            paymentRecordId: claimed.paymentRecordId as Id<'paymentRecords'>,
          });
          setOptimistic((o) => {
            const { [row.membershipId]: _drop, ...rest } = o;
            return rest;
          });
          toast(t('meeting.undone', { name: row.displayName }));
        } catch (err) {
          haptics.error();
          toast.error(err instanceof Error ? err.message : t('common.error'));
        }
        return;
      }
      // Payer-side claim (the member declared from home) → my tap CONFIRMS
      // the EXISTING record. Never a second claim (double-count risk).
      setOptimistic((o) => ({ ...o, [row.membershipId]: 'confirmed' }));
      try {
        await confirm({
          paymentRecordId: claimed.paymentRecordId as Id<'paymentRecords'>,
          channel: 'meeting',
        });
      } catch (err) {
        setOptimistic((o) => {
          const { [row.membershipId]: _drop, ...rest } = o;
          return rest;
        });
        haptics.error();
        toast.error(err instanceof Error ? err.message : t('common.error'));
      }
      return;
    }
  };

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  };

  return (
    <View className="flex-1 bg-background" style={screenPadding}>
      {/* Header — cash custody named, always (00 red line) */}
      <View className="flex-row items-start justify-between gap-sm">
        <View className="min-w-0 flex-1">
          <Text className="font-heading text-headline text-foreground">
            {t('meeting.title')}
          </Text>
          {round ? (
            <Text className="font-body-semi text-body-sm text-muted">
              {t('meeting.custodyHeader', {
                name: round.custodianName,
              }).toUpperCase()}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <XMarkIcon size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      {/* Sync counter — visible truth about undelivered taps (03 §D) */}
      {pendingSync > 0 ? (
        <View className="mt-sm self-start rounded-pill bg-warning-bg px-sm py-[3px]">
          <Text className="font-body-medium text-caption text-warning-dark">
            {t('meeting.pendingSync', { count: pendingSync })}
          </Text>
        </View>
      ) : null}

      {rows === undefined || round === null ? (
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[64px] rounded-lg" />
        </View>
      ) : finishing && summary ? (
        /* Terminer summary — pot custody-framed; caisse (amendes) is a
           SEPARATE line when fines ship, never summed (B6 DECISION). */
        <View className="mt-xl gap-md">
          <Text className="font-heading text-title text-foreground">
            {t('meeting.summaryTitle')}
          </Text>
          <Text className="font-body text-body text-foreground">
            {t('round.pot.custody', {
              confirmed: formatCurrencyXAF(summary.confirmedSum),
              expected: formatCurrencyXAF(
                (round?.expectedTotal ?? 0) as number
              ),
              name: round?.custodianName ?? '—',
            })}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {t('meeting.summaryCounts', {
              settled: summary.settled,
              total: summary.total,
            })}
          </Text>
          {summary.inFlightSum > 0 ? (
            <Text className="font-body text-body-sm text-muted">
              {t('round.inFlight', {
                amount: formatCurrencyXAF(summary.inFlightSum),
              })}
            </Text>
          ) : null}
          <Text className="font-body text-body-sm text-muted">
            {t('meeting.readOutNote')}
          </Text>
          <AppButton
            label={t('meeting.backToRollCall')}
            variant="outline"
            onPress={() => setFinishing(false)}
          />
          <AppButton label={t('common.close')} onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <ScrollView
            className="mt-md flex-1"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-xs pb-lg">
              {rows.map((row) => (
                <RollCallRow
                  key={row.membershipId}
                  row={row}
                  optimisticState={optimistic[row.membershipId]}
                  onTap={() => void runTap(row)}
                  onLongPress={() => {
                    const pending = row.records.find(
                      (r) => r.state === 'pending'
                    );
                    if (pending) {
                      setEditing({
                        recordId: pending.paymentRecordId,
                        memberName: row.displayName,
                        amountText: String(pending.amount),
                      });
                    }
                  }}
                />
              ))}
            </View>
          </ScrollView>

          {/* Long-press amount editor (partial payments, 02 §e7) */}
          {editing ? (
            <View className="gap-sm border-t border-border-subtle pt-sm">
              <TextField
                label={t('meeting.editAmount', { name: editing.memberName })}
                value={editing.amountText}
                onChangeText={(text) =>
                  setEditing({ ...editing, amountText: text })
                }
                keyboardType="number-pad"
                autoFocus
              />
              <View className="flex-row gap-sm">
                <AppButton
                  className="flex-1"
                  label={t('meeting.recordAmount')}
                  onPress={() => {
                    const amount = Number(
                      editing.amountText.replace(/[\s.]/g, '')
                    );
                    const row = rows.find((r) =>
                      r.records.some(
                        (rec) => rec.paymentRecordId === editing.recordId
                      )
                    );
                    setEditing(null);
                    if (row && Number.isInteger(amount) && amount > 0) {
                      void runTap(row, amount);
                    } else {
                      toast.error(t('pay.invalidAmount'));
                    }
                  }}
                />
                <AppButton
                  variant="ghost"
                  label={t('common.cancel')}
                  onPress={() => setEditing(null)}
                />
              </View>
            </View>
          ) : (
            <AppButton
              label={t('meeting.finish')}
              testID="meeting-finish"
              onPress={() => setFinishing(true)}
            />
          )}
        </>
      )}
    </View>
  );
}

function RollCallRow({
  row,
  optimisticState,
  onTap,
  onLongPress,
}: {
  row: PaymentRow;
  optimisticState?: 'claimed' | 'confirmed';
  onTap: () => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();

  const hasPending = row.records.some((r) => r.state === 'pending');
  const claimed = row.records.find((r) => r.state === 'claimed');
  const disputed = row.records.some((r) => r.state === 'disputed');
  const myTick = claimed?.claimedBySide === 'payee';

  // Optimistic override wins until the reactive row catches up.
  const visual = optimisticState
    ? optimisticState
    : row.isSettled
      ? 'settled'
      : disputed
        ? 'disputed'
        : claimed
          ? claimed.claimedBySide === 'payer'
            ? 'payerClaimed'
            : 'myTick'
          : hasPending
            ? 'pending'
            : 'settled';

  const rowStyle =
    visual === 'settled' || visual === 'confirmed'
      ? 'flex-row items-center gap-sm rounded-lg border border-border-faint bg-surface-muted p-md'
      : visual === 'disputed'
        ? 'flex-row items-center gap-sm rounded-lg border border-warning-dark bg-warning-bg p-md'
        : 'flex-row items-center gap-sm rounded-lg border border-border bg-surface p-md active:bg-accent-faint';

  return (
    <Pressable
      accessibilityRole="button"
      testID={`roll-call-${row.membershipId}`}
      onPress={onTap}
      onLongPress={onLongPress}
      disabled={visual === 'settled' || visual === 'confirmed'}
      className={rowStyle}
    >
      <Text className="min-w-0 flex-1 font-body-semi text-body text-foreground">
        {row.displayName}
      </Text>
      {visual === 'pending' ? (
        <Text className="font-body text-body-sm text-muted">
          {formatCurrencyXAF(row.expectedAmount)}
        </Text>
      ) : null}
      {visual === 'settled' || visual === 'confirmed' ? (
        <Badge tone="success" label={`✓ ${t('payments.state.confirmed')}`} />
      ) : visual === 'disputed' ? (
        <Badge tone="warning" label={`⚠ ${t('payments.state.disputed')}`} />
      ) : visual === 'myTick' || visual === 'claimed' ? (
        <View className="flex-row items-center gap-sm">
          <Badge tone="accent" label={`⏳ ${t('payments.state.claimed')}`} />
          {myTick ? (
            <Text className="font-body-semi text-body text-accent">↩</Text>
          ) : null}
        </View>
      ) : visual === 'payerClaimed' ? (
        <Badge tone="accent" label={t('meeting.tapToConfirm')} />
      ) : null}
    </Pressable>
  );
}
