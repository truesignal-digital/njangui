import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../src/lib/convex-api';
import { formatCurrencyXAF } from '../../../../../../src/lib/format-currency';
import { throwIfPilotOffline } from '../../../../../../src/lib/dev-pilot';
import { haptics } from '../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../src/lib/idempotency';
import {
  dequeueTap,
  enqueueTap,
  isTransientMeetingSyncError,
  loadQueue,
  replayQueue,
} from '../../../../../../src/lib/meeting-queue';
import {
  buildRoundSummary,
  shareRoundSummary,
} from '../../../../../../src/lib/round-summary';
import { useAppTheme } from '../../../../../../src/lib/theme';
import { AppButton } from '../../../../../../src/components/ui/button';
import {
  Badge,
  PaymentStateBadge,
} from '../../../../../../src/components/ui/badge';
import { TextField } from '../../../../../../src/components/ui/text-field';
import { Skeleton } from '../../../../../../src/components/skeleton';
import { mobileUiConfig } from '../../../../../../src/lib/mobile-ui-config';
import { toIntlLocale } from '../../../../../../src/lib/app-locale';
import { NjangiMark } from '../../../../../../src/components/brand/njangi-mark';
import { useHardwareBack } from '@/hooks/use-hardware-back';
import { meetingExitAction, unsentTapCount } from '@/lib/meeting-exit';

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
  const { t, i18n } = useTranslation();
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
  const group = useQuery(
    api.groups.getGroup,
    isAuthenticated && groupId
      ? { groupId: groupId as Id<'groups'> }
      : ('skip' as const)
  );
  const claim = useMutation(api.paymentRecords.claim);
  const confirm = useMutation(api.paymentRecords.confirm);
  const cancel = useMutation(api.paymentRecords.cancel);

  // Optimistic row states — set the instant a tap lands, cleared when the
  // server row catches up (reactive query re-render supersedes them).
  const [optimistic, setOptimistic] = useState<
    Record<string, 'claimed' | 'confirmed'>
  >({});
  const [pendingSync, setPendingSync] = useState(0);
  const [syncingCount, setSyncingCount] = useState(0);
  const [recordedThisSession, setRecordedThisSession] = useState(0);
  const [syncIssues, setSyncIssues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{
    recordId: string;
    memberName: string;
    amountText: string;
  } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const keysRef = useRef(new Map<string, string>());
  const leavingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    if (!roundId) return;
    const queue = await loadQueue(roundId);
    setPendingSync(queue.length);
  }, [roundId]);

  const addSyncIssue = useCallback((recordId: string, error: unknown) => {
    setSyncIssues((current) => ({
      ...current,
      [recordId]: error instanceof Error ? error.message : 'Ledger conflict',
    }));
  }, []);

  // Replay the durable queue on mount — taps lost to an app kill re-fire
  // with their ORIGINAL keys (server no-ops the ones that landed).
  useEffect(() => {
    if (!roundId || !isAuthenticated) return;
    let live = true;
    void (async () => {
      const pending = await loadQueue(roundId);
      if (!live) return;
      setPendingSync(pending.length);
      if (pending.length > 0) setSyncingCount((count) => count + pending.length);
      const result = await replayQueue(roundId, {
        claim: async (tap) => {
          await throwIfPilotOffline();
          await claim({
            paymentRecordId: tap.recordId as Id<'paymentRecords'>,
            idempotencyKey: tap.idempotencyKey,
            method: 'cash',
            ...(tap.amount !== undefined && { amount: tap.amount }),
          });
        },
        confirm: async (tap) => {
          await throwIfPilotOffline();
          await confirm({
            paymentRecordId: tap.recordId as Id<'paymentRecords'>,
            channel: 'meeting',
          });
        },
      }, (tap, error) => addSyncIssue(tap.recordId, error));
      if (live) {
        setRecordedThisSession((count) => count + result.processed);
        setSyncingCount((count) => Math.max(0, count - pending.length));
      }
      if (live) await refreshPendingCount();
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, isAuthenticated, addSyncIssue, claim, confirm, refreshPendingCount]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const settled = rows.filter((r) => r.isSettled).length;
    const confirmedSum = rows.reduce((sum, r) => sum + r.confirmedAmount, 0);
    const inFlightSum = rows.reduce((sum, r) => sum + r.inFlightAmount, 0);
    return { settled, total: rows.length, confirmedSum, inFlightSum };
  }, [rows]);

  const leaveMeeting = () => {
    // A second tap would pop the screen underneath too.
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Android Back and both close buttons share this path.
  const requestExit = () => {
    const action = meetingExitAction({
      pending: pendingSync,
      syncing: syncingCount,
      editorOpen: editing !== null,
    });
    if (action === 'close-editor') setEditing(null);
    else if (action === 'confirm') setExitConfirm(true);
    else leaveMeeting();
  };

  useHardwareBack(() => {
    requestExit();
    return true;
  });

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
      try {
        await enqueueTap(roundId, {
          recordId,
          idempotencyKey: key,
          action: 'claim',
          amount: amountOverride,
          queuedAt: Date.now(),
        });
      } catch (err) {
        keysRef.current.delete(recordId);
        setOptimistic((o) => {
          const { [row.membershipId]: _drop, ...rest } = o;
          return rest;
        });
        haptics.error();
        toast.error(err instanceof Error ? err.message : t('common.error'));
        return;
      }
      void refreshPendingCount();
      setSyncingCount((count) => count + 1);
      try {
        await throwIfPilotOffline();
        await claim({
          paymentRecordId: recordId as Id<'paymentRecords'>,
          idempotencyKey: key,
          method: 'cash',
          ...(amountOverride !== undefined && { amount: amountOverride }),
        });
        await dequeueTap(roundId, key);
        setRecordedThisSession((count) => count + 1);
        // Server row is authoritative now — a stale optimistic 'claimed'
        // must not mask a self-record that confirmed in one mutation.
        setOptimistic((o) => {
          const { [row.membershipId]: _drop, ...rest } = o;
          return rest;
        });
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
        } else if (!isTransientMeetingSyncError(err)) {
          await dequeueTap(roundId, key);
          setOptimistic((o) => {
            const { [row.membershipId]: _drop, ...rest } = o;
            return rest;
          });
          haptics.error();
          toast.error(err.message);
          addSyncIssue(recordId, err);
        }
        // network errors: stays queued, optimistic state stands
      } finally {
        setSyncingCount((count) => Math.max(0, count - 1));
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
      const recordId = claimed.paymentRecordId;
      let key = keysRef.current.get(recordId);
      if (!key) {
        key = newIdempotencyKey();
        keysRef.current.set(recordId, key);
      }
      setOptimistic((o) => ({ ...o, [row.membershipId]: 'confirmed' }));
      try {
        await enqueueTap(roundId, {
          recordId,
          idempotencyKey: key,
          action: 'confirm',
          queuedAt: Date.now(),
        });
      } catch (err) {
        keysRef.current.delete(recordId);
        setOptimistic((o) => {
          const { [row.membershipId]: _drop, ...rest } = o;
          return rest;
        });
        haptics.error();
        toast.error(err instanceof Error ? err.message : t('common.error'));
        return;
      }
      void refreshPendingCount();
      setSyncingCount((count) => count + 1);
      try {
        await throwIfPilotOffline();
        await confirm({
          paymentRecordId: recordId as Id<'paymentRecords'>,
          channel: 'meeting',
        });
        await dequeueTap(roundId, key);
        setRecordedThisSession((count) => count + 1);
        setOptimistic((o) => {
          const { [row.membershipId]: _drop, ...rest } = o;
          return rest;
        });
      } catch (err) {
        if (!isTransientMeetingSyncError(err)) {
          await dequeueTap(roundId, key);
          setOptimistic((o) => {
            const { [row.membershipId]: _drop, ...rest } = o;
            return rest;
          });
          haptics.error();
          toast.error(err.message);
          addSyncIssue(recordId, err);
        }
        // Network errors remain queued and optimistic until replay.
      } finally {
        setSyncingCount((count) => Math.max(0, count - 1));
        keysRef.current.delete(recordId);
        void refreshPendingCount();
      }
      return;
    }
  };

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  };
  const gatheringDate = round
    ? new Date(round.dueAt).toLocaleDateString(
        toIntlLocale(i18n.language),
        { day: '2-digit', month: 'long' }
      )
    : null;

  return (
    <View className="flex-1 bg-background" style={screenPadding}>
      {/* Header — cash custody named, always (00 red line) */}
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
        <View className="flex-row items-start justify-between gap-sm">
          <View className="min-w-0 flex-1 gap-[3px]">
            {gatheringDate ? (
              <Text className="font-heading text-display-lg text-warning-dark">
                {gatheringDate}
              </Text>
            ) : null}
            <Text className="font-heading text-headline text-foreground">
              {group?.name ?? t('meeting.title')}
            </Text>
            {round ? (
              <Text className="font-body-semi text-body-sm text-foreground">
                {t('meeting.roundContext', {
                  n: round.index,
                  name: round.beneficiaryName,
                })}
              </Text>
            ) : null}
            {round ? (
              <Text className="font-body text-caption text-muted">
                {t('meeting.custodyHeader', {
                  name: round.custodianName,
                })}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={requestExit}
            className="h-[44px] w-[44px] items-center justify-center rounded-full bg-surface active:bg-surface-muted"
          >
            <XMarkIcon size={22} color={theme.textMuted} />
          </Pressable>
          <View className="absolute bottom-md right-md opacity-20">
            <NjangiMark size={62} color={theme.successDark} />
          </View>
        </View>
      </View>

      <MeetingSteps reviewing={finishing} />

      <MeetingSyncStatus
        pendingCount={pendingSync}
        syncingCount={syncingCount}
        recordedCount={recordedThisSession}
        issues={syncIssues}
        rows={rows ?? []}
        onOpen={(paymentRecordId) =>
          router.push({
            pathname: '/payments/[paymentId]',
            params: { paymentId: paymentRecordId },
          })
        }
      />

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
          {round && rows && group ? (
            <AppButton
              label={t('meeting.share')}
              testID="meeting-share"
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
          <AppButton
            label={t('meeting.backToRollCall')}
            variant="outline"
            onPress={() => setFinishing(false)}
          />
          <AppButton
            variant="ghost"
            label={t('common.close')}
            onPress={requestExit}
          />
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

      <MeetingExitSheet
        visible={exitConfirm}
        unsentCount={unsentTapCount({
          pending: pendingSync,
          syncing: syncingCount,
        })}
        onStay={() => setExitConfirm(false)}
        // Navigate only: hiding the Modal in the same tick races two
        // dismissal animations; the route unmount takes the Modal down.
        onLeave={leaveMeeting}
      />
    </View>
  );
}

function MeetingExitSheet({
  visible,
  unsentCount,
  onStay,
  onLeave,
}: {
  visible: boolean;
  unsentCount: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onStay}
    >
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="rounded-t-2xl bg-surface p-lg"
          style={{ paddingBottom: insets.bottom + theme.spacing.lg }}
        >
          <Text className="font-heading text-title text-foreground">
            {t('meeting.exitConfirm.title', { count: unsentCount })}
          </Text>
          <Text className="mt-sm font-body text-body-sm text-muted">
            {t('meeting.exitConfirm.body', { count: unsentCount })}
          </Text>
          <View className="mt-lg gap-sm">
            <AppButton
              label={t('meeting.exitConfirm.stay')}
              onPress={onStay}
              testID="meeting-exit-stay"
            />
            <AppButton
              variant="ghost"
              label={t('meeting.exitConfirm.leave')}
              onPress={onLeave}
              testID="meeting-exit-leave"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MeetingSteps({ reviewing }: { reviewing: boolean }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const steps = [
    { label: t('meeting.steps.record'), state: reviewing ? 'done' : 'current' },
    { label: t('meeting.steps.review'), state: reviewing ? 'current' : 'next' },
    { label: t('meeting.steps.share'), state: 'next' },
  ] as const;

  return (
    <View className="mt-md">
      <Text className="pb-xs font-body-semi text-overline uppercase text-muted">
        {t('groups.cycle.thisRound')}
      </Text>
      <View className="overflow-hidden rounded-2xl bg-surface px-md">
        {steps.map((step, index) => (
          <View
            key={step.label}
            className={`min-h-[56px] flex-row items-center gap-sm py-xs ${
              index > 0 ? 'border-t border-border-faint' : ''
            }`}
          >
          <Animated.View
            key={step.state}
            entering={FadeIn.duration(
              mobileUiConfig.motion.successDuration
            ).reduceMotion(ReduceMotion.System)}
            className={`h-[28px] w-[28px] items-center justify-center rounded-full ${
              step.state === 'current'
                ? 'bg-accent'
                : step.state === 'done'
                  ? 'bg-success'
                  : 'bg-surface-muted'
            }`}
          >
            {step.state === 'done' ? (
              <CheckCircleIcon size={16} color={theme.textInverted} />
            ) : (
              <Text
                className={`font-body-semi text-caption ${
                  step.state === 'current' ? 'text-primary-fg' : 'text-muted'
                }`}
              >
                {index + 1}
              </Text>
            )}
          </Animated.View>
          <Text
            className={`font-body-semi text-body-sm ${
              step.state === 'next' ? 'text-muted' : 'text-foreground'
            }`}
          >
            {step.label}
          </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MeetingSyncStatus({
  pendingCount,
  syncingCount,
  recordedCount,
  issues,
  rows,
  onOpen,
}: {
  pendingCount: number;
  syncingCount: number;
  recordedCount: number;
  issues: Record<string, string>;
  rows: PaymentRow[];
  onOpen: (paymentRecordId: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const issueEntries = Object.entries(issues);

  if (issueEntries.length > 0) {
    return (
      <View className="mt-sm gap-xs rounded-lg border border-destructive bg-destructive-bg p-sm">
        <View className="flex-row items-start gap-xs">
          <ExclamationTriangleIcon size={18} color={theme.destructiveDark} />
          <View className="min-w-0 flex-1">
            <Text className="font-body-semi text-body-sm text-destructive-dark">
              {t('meeting.needsAttention', { count: issueEntries.length })}
            </Text>
            <Text className="font-body text-caption text-muted">
              {t('meeting.othersRecorded')}
            </Text>
          </View>
        </View>
        {issueEntries.map(([recordId, message]) => {
          const member = rows.find((row) =>
            row.records.some((record) => record.paymentRecordId === recordId)
          );
          return (
            <Pressable
              key={recordId}
              accessibilityRole="button"
              onPress={() => onOpen(recordId)}
              className="rounded-md border border-border bg-surface px-sm py-xs active:bg-surface-muted"
            >
              <Text className="font-body-semi text-body-sm text-foreground">
                {member?.displayName ?? t('meeting.unknownEntry')}
              </Text>
              <Text numberOfLines={1} className="font-body text-caption text-muted">
                {message}
              </Text>
              <Text className="pt-[2px] font-body-semi text-caption text-accent">
                {t('meeting.openEntry')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View className="mt-sm flex-row items-start gap-xs rounded-lg border border-warning-dark bg-warning-bg p-sm">
        <CloudArrowUpIcon size={18} color={theme.warningDark} />
        <View className="min-w-0 flex-1">
          <Text className="font-body-semi text-body-sm text-warning-dark">
            {t('meeting.savedOnPhone', { count: pendingCount })}
          </Text>
          <Text className="font-body text-caption text-muted">
            {syncingCount > 0
              ? t('meeting.synchronizing')
              : t('meeting.safeToLeave')}
          </Text>
        </View>
      </View>
    );
  }

  if (recordedCount > 0) {
    return (
      <View className="mt-sm flex-row items-center gap-xs rounded-lg bg-success-bg p-sm">
        <CheckCircleIcon size={18} color={theme.successDark} />
        <Text className="font-body-semi text-body-sm text-success-dark">
          {t('meeting.recordedCount', { count: recordedCount })}
        </Text>
      </View>
    );
  }

  return null;
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
  const theme = useAppTheme();

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
        <PaymentStateBadge
          state="confirmed"
          label={t('payments.state.confirmed')}
        />
      ) : visual === 'disputed' ? (
        <PaymentStateBadge
          state="disputed"
          label={t('payments.state.disputed')}
        />
      ) : visual === 'myTick' || visual === 'claimed' ? (
        <View className="flex-row items-center gap-sm">
          <PaymentStateBadge
            state="claimed"
            label={t('payments.state.claimed')}
          />
          {myTick ? (
            <ArrowUturnLeftIcon size={16} color={theme.accent} />
          ) : null}
        </View>
      ) : visual === 'payerClaimed' ? (
        <Badge tone="accent" label={t('meeting.tapToConfirm')} />
      ) : null}
    </Pressable>
  );
}
