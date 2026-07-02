import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowsUpDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LockClosedIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';
import { toast } from 'sonner-native';

import { api, type Id } from '../../../../src/lib/convex-api';
import { haptics } from '../../../../src/lib/haptics';
import { useAppTheme, useShadow } from '../../../../src/lib/theme';
import { AppButton } from '../../../../src/components/ui/button';
import { Skeleton } from '../../../../src/components/skeleton';

type OrderRow = { membershipId: string; displayName: string };

/**
 * Next valid start date (YYYY-MM-DD), UTC, matching the backend's
 * dayOfWeekOf (getUTCDay) guard. Weekly/biweekly must land on the meeting
 * weekday; monthly is unconstrained. Always ≥ 2 days out so the cron never
 * blasts round 1 before members can pay (startCycle rejects past dates).
 */
function defaultStartDateISO(meetingDayOfWeek: number | undefined): string {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 2);
  if (typeof meetingDayOfWeek === 'number') {
    for (let i = 0; i < 7; i++) {
      if (base.getUTCDay() === meetingDayOfWeek) break;
      base.setUTCDate(base.getUTCDate() + 1);
    }
  } else {
    base.setUTCDate(base.getUTCDate() + 5); // monthly: a week out
  }
  return base.toISOString().slice(0, 10);
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  // Fisher–Yates with a non-Math.random-free seed is fine here (client UI).
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Cycle-start builder (docs/03 §B2, 02 §a). Arrange the rotation order
 * (up/down — reliable on low-end Android, no drag mis-fires), then the
 * president locks it: the order becomes immutable and public, and the whole
 * cycle materializes. Reorders persist as a draft (api.cycles.saveDraftOrder)
 * so the work survives leaving the screen.
 */
export default function StartCycleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const shadow = useShadow();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { isAuthenticated } = useConvexAuth();

  const queryArgs =
    isAuthenticated && groupId
      ? { groupId: groupId as Id<'groups'> }
      : ('skip' as const);
  const group = useQuery(api.groups.getGroup, queryArgs);
  const members = useQuery(api.memberships.listMembers, queryArgs);
  const draft = useQuery(api.cycles.getDraftOrder, queryArgs);

  const saveDraftOrder = useMutation(api.cycles.saveDraftOrder);
  const startCycle = useMutation(api.cycles.startCycle);

  const [order, setOrder] = useState<OrderRow[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed once from the saved draft if present, else from active members in
  // join order. `order === null` means "not seeded yet".
  const seed = useMemo<OrderRow[] | null>(() => {
    if (members === undefined || draft === undefined) return null;
    const active = members
      .filter((m) => m.status === 'active')
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const nameById = new Map(
      active.map((m) => [m.membershipId, m.displayName])
    );
    if (draft && draft.order.length > 0) {
      const valid = draft.order.filter((r) => nameById.has(r.membershipId));
      // Append any active member missing from the draft (added after it was saved).
      const inDraft = new Set(valid.map((r) => r.membershipId));
      const extra = active
        .filter((m) => !inDraft.has(m.membershipId))
        .map((m) => ({
          membershipId: m.membershipId,
          displayName: m.displayName,
        }));
      return [...valid, ...extra];
    }
    return active.map((m) => ({
      membershipId: m.membershipId,
      displayName: m.displayName,
    }));
  }, [members, draft]);

  useEffect(() => {
    if (order === null && seed !== null) setOrder(seed);
  }, [order, seed]);

  const persist = (next: OrderRow[]) => {
    if (!groupId) return;
    void saveDraftOrder({
      groupId: groupId as Id<'groups'>,
      rotationOrder: next.map((r) => r.membershipId as Id<'memberships'>),
    }).catch(() => {
      /* draft persistence is best-effort; the lock re-validates */
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    if (!order) return;
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    haptics.light();
    setOrder(next);
    persist(next);
  };

  // « Deux mains » (02 §b): a member may hold several positions — extra
  // hands mean N beneficiary rounds and N× the contribution each round.
  const addHand = (index: number) => {
    if (!order) return;
    const next = order.slice();
    next.splice(index + 1, 0, { ...order[index] });
    haptics.light();
    setOrder(next);
    persist(next);
  };

  const removeHand = (index: number) => {
    if (!order) return;
    const id = order[index].membershipId;
    if (order.filter((r) => r.membershipId === id).length < 2) return;
    const next = order.slice();
    next.splice(index, 1);
    haptics.light();
    setOrder(next);
    persist(next);
  };

  /** 1-based hand number of this position among the member's positions. */
  const handNumber = (index: number): number => {
    if (!order) return 1;
    let n = 0;
    for (let i = 0; i <= index; i++) {
      if (order[i].membershipId === order[index].membershipId) n++;
    }
    return n;
  };

  const shuffle = () => {
    if (!order) return;
    const next = shuffled(order);
    haptics.light();
    setOrder(next);
    persist(next);
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const isPresident = group?.viewerRole === 'president';

  const handleLock = async () => {
    if (!groupId || !order || !group) return;
    setBusy(true);
    try {
      await startCycle({
        groupId: groupId as Id<'groups'>,
        rotationOrder: order.map((r) => r.membershipId as Id<'memberships'>),
        startDate: defaultStartDateISO(group.meetingDayOfWeek),
      });
      haptics.success();
      toast.success(t('groups.cycle.lockedToast'));
      setConfirming(false);
      close();
    } catch (err) {
      haptics.error();
      const message = err instanceof Error ? err.message : t('common.error');
      toast.error(message);
      setBusy(false);
      setConfirming(false);
    }
  };

  const screenPadding = {
    paddingTop: Math.max(insets.top, theme.spacing.lg),
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  const loading = group === undefined || order === null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={screenPadding}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between gap-sm pb-lg">
          <View className="min-w-0 flex-1 gap-xs">
            <Text className="font-heading text-headline text-foreground">
              {t('groups.cycle.title')}
            </Text>
            <Text className="font-body text-body-sm text-muted">
              {t('groups.cycle.subtitle')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={close}
            className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
          >
            <XMarkIcon size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <View className="gap-sm">
            <Skeleton className="h-[56px] rounded-lg" />
            <Skeleton className="h-[56px] rounded-lg" />
            <Skeleton className="h-[56px] rounded-lg" />
          </View>
        ) : (
          <>
            <View className="mb-md flex-row items-center justify-between">
              <Text className="font-body-semi text-title text-foreground">
                {t('groups.cycle.orderTitle')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('groups.cycle.shuffle')}
                onPress={shuffle}
                className="flex-row items-center gap-xs rounded-pill border border-border bg-surface px-md py-xs active:bg-surface-muted"
              >
                <ArrowsUpDownIcon size={16} color={theme.accent} />
                <Text className="font-body-medium text-body-sm text-foreground">
                  {t('groups.cycle.shuffle')}
                </Text>
              </Pressable>
            </View>

            <View className="gap-xs" style={shadow('card')}>
              {(order ?? []).map((row, index) => (
                <View
                  key={`${row.membershipId}:${index}`}
                  className="flex-row items-center gap-sm rounded-lg border border-border-subtle bg-surface p-sm"
                >
                  <View className="h-[28px] w-[28px] items-center justify-center rounded-full bg-accent-faint">
                    <Text className="font-body-semi text-body-sm text-accent">
                      {index + 1}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-body-medium text-body text-foreground"
                    >
                      {row.displayName}
                    </Text>
                    {handNumber(index) > 1 ? (
                      <Text className="font-body text-caption text-muted">
                        {t('groups.cycle.handBadge', { n: handNumber(index) })}
                      </Text>
                    ) : null}
                  </View>
                  {handNumber(index) === 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('groups.cycle.addHand')}
                      onPress={() => addHand(index)}
                      className="h-[34px] w-[34px] items-center justify-center rounded-md active:bg-surface-muted"
                      testID={`add-hand-${index}`}
                    >
                      <PlusIcon size={18} color={theme.accent} />
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('groups.cycle.removeHand')}
                      onPress={() => removeHand(index)}
                      className="h-[34px] w-[34px] items-center justify-center rounded-md active:bg-surface-muted"
                      testID={`remove-hand-${index}`}
                    >
                      <MinusIcon size={18} color={theme.textMuted} />
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.cycle.moveUp')}
                    disabled={index === 0}
                    onPress={() => move(index, -1)}
                    className="h-[34px] w-[34px] items-center justify-center rounded-md active:bg-surface-muted disabled:opacity-30"
                    style={{ opacity: index === 0 ? 0.3 : 1 }}
                  >
                    <ChevronUpIcon size={20} color={theme.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.cycle.moveDown')}
                    disabled={index === (order?.length ?? 0) - 1}
                    onPress={() => move(index, 1)}
                    className="h-[34px] w-[34px] items-center justify-center rounded-md active:bg-surface-muted"
                    style={{
                      opacity: index === (order?.length ?? 0) - 1 ? 0.3 : 1,
                    }}
                  >
                    <ChevronDownIcon size={20} color={theme.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>

            {isPresident ? (
              <AppButton
                label={t('groups.cycle.startCta')}
                icon={
                  <LockClosedIcon size={18} color={theme.primaryForeground} />
                }
                className="mt-xl"
                disabled={(order?.length ?? 0) < 2}
                onPress={() => setConfirming(true)}
                testID="start-cycle-cta"
              />
            ) : (
              <Text className="mt-xl text-center font-body text-body-sm text-muted">
                {t('groups.cycle.presidentOnly')}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Lock confirm — immutability must be unmistakable (02 §a, gate note). */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View
            className="rounded-t-2xl bg-surface p-lg"
            style={{ paddingBottom: insets.bottom + theme.spacing.lg }}
          >
            <Text className="font-heading text-title text-foreground">
              {t('groups.cycle.confirmTitle')}
            </Text>
            <Text className="mt-sm font-body text-body-sm text-muted">
              {t('groups.cycle.confirmBody')}
            </Text>
            <View className="mt-lg gap-sm">
              <AppButton
                label={
                  busy
                    ? t('groups.cycle.locking')
                    : t('groups.cycle.confirmLock')
                }
                loading={busy}
                disabled={busy}
                onPress={() => void handleLock()}
                testID="confirm-lock-cta"
              />
              <AppButton
                variant="ghost"
                label={t('common.cancel')}
                disabled={busy}
                onPress={() => setConfirming(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
