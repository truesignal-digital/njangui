import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api, type Id } from '@/lib/convex-api';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from '@/components/ui/button';
import { Skeleton } from '@/components/skeleton';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { toIntlLocale } from '@/lib/app-locale';
import { Icon } from '@/components/ui/icon';

/**
 * Group-home rotation block (docs/03 §B2). State-driven:
 * - `setup` / `between_cycles`: president gets « Démarrer le cycle » →
 *   the builder (start-cycle route); others see a waiting note.
 * - `active`: the LOCKED, public rotation order with the current round
 *   highlighted + a pot-progress card (api.cycles.getActiveCycle /
 *   api.rounds.getRound). Locked order visible to every member (trust #6).
 */
export function RotationSection({
  groupId,
  groupStatus,
  viewerRole,
  activeMemberCount,
}: {
  groupId: Id<'groups'>;
  groupStatus: string;
  viewerRole: 'president' | 'treasurer' | 'member' | null;
  activeMemberCount: number;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const [showAllRounds, setShowAllRounds] = useState(false);

  const isActive = groupStatus === 'active';
  const cycle = useQuery(
    api.cycles.getActiveCycle,
    isAuthenticated && isActive ? { groupId } : ('skip' as const)
  );

  // ── setup / between_cycles: start CTA ──────────────────────
  if (!isActive) {
    const canStart = viewerRole === 'president';
    return (
      <View className="gap-sm">
        <View className="flex-row items-center gap-sm">
          <Icon name="pending" size="control" color={theme.textMuted} />
          <Text className="flex-1 font-body text-body-sm text-muted">
            {canStart
              ? t('groups.cycle.setupReady')
              : t('groups.cycle.setupWaiting')}
          </Text>
        </View>
        {canStart ? (
          <AppButton
            label={t('groups.cycle.startCta')}
            icon="start"
            disabled={activeMemberCount < 2}
            onPress={() =>
              router.push({
                pathname: '/groups/[groupId]/start-cycle',
                params: { groupId },
              })
            }
            testID="open-start-cycle"
          />
        ) : null}
      </View>
    );
  }

  // ── active: locked rotation + current round ────────────────
  if (cycle === undefined) {
    return (
      <View className="gap-sm">
        <Skeleton className="h-[64px] rounded-lg" />
        <Skeleton className="h-[48px] rounded-md" />
        <Skeleton className="h-[48px] rounded-md" />
      </View>
    );
  }
  if (cycle === null) {
    return (
      <Text className="font-body text-body-sm text-muted">
        {t('groups.cycle.noActive')}
      </Text>
    );
  }

  const currentRound = cycle.rounds.find(
    (r) => r.roundId === cycle.currentRoundId
  );
  const currentIndex = cycle.rounds.findIndex(
    (r) => r.roundId === cycle.currentRoundId
  );
  const visibleRounds =
    showAllRounds || cycle.rounds.length <= 3
      ? cycle.rounds
      : cycle.rounds.slice(
          Math.max(currentIndex, 0),
          Math.max(currentIndex, 0) + 2
        );
  const hiddenCount = cycle.rounds.length - visibleRounds.length;

  return (
    <View className="gap-md">
      {/* Cycle header + locked badge */}
      <View className="flex-row items-center justify-between">
        <Text className="font-body-semi text-body text-foreground">
          {t('groups.cycle.cycleN', { n: cycle.index })}
        </Text>
        <View className="flex-row items-center gap-xs rounded-pill bg-surface-muted px-sm py-[2px]">
          <Icon name="locked" size="metadata" color={theme.textMuted} />
          <Text className="font-body-medium text-caption text-muted">
            {t('groups.cycle.locked')}
          </Text>
        </View>
      </View>

      {/* Current round pot card — taps through to the round detail screen */}
      {currentRound ? (
        <CurrentRoundCard groupId={groupId} roundId={currentRound.roundId} />
      ) : null}

      {/* Rotation list — current + next by default; the full order stays a
          tap away so it can't dominate the first viewport. */}
      <View className="gap-xs">
        {visibleRounds.map((round) => {
          const isCurrent = round.roundId === cycle.currentRoundId;
          const done = round.status === 'completed';
          return (
            <View
              key={round.roundId}
              className={
                isCurrent
                  ? 'flex-row items-center gap-sm rounded-lg border border-accent bg-accent-faint p-sm'
                  : 'flex-row items-center gap-sm rounded-lg p-sm'
              }
            >
              <View
                className={
                  isCurrent
                    ? 'h-[26px] w-[26px] items-center justify-center rounded-full bg-accent'
                    : 'h-[26px] w-[26px] items-center justify-center rounded-full bg-surface-muted'
                }
              >
                <Text
                  className={
                    isCurrent
                      ? 'font-body-semi text-caption text-primary-fg'
                      : 'font-body-semi text-caption text-muted'
                  }
                >
                  {round.index}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-body-medium text-body-sm text-foreground"
              >
                {round.beneficiaryName}
              </Text>
              {isCurrent ? (
                <Text className="font-body-semi text-caption text-accent">
                  {t('groups.cycle.thisRound')}
                </Text>
              ) : done ? (
                <Icon name="confirmed" size="metadata" color={theme.textMuted} />
              ) : null}
            </View>
          );
        })}
        {cycle.rounds.length > 3 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showAllRounds }}
            testID="toggle-rotation-order"
            onPress={() => setShowAllRounds((open) => !open)}
            className="min-h-[40px] flex-row items-center justify-center gap-xs rounded-lg active:bg-surface-muted"
          >
            <Text className="font-body-medium text-body-sm text-accent">
              {showAllRounds
                ? t('groups.cycle.hideOrder')
                : t('groups.cycle.showOrder', { count: hiddenCount })}
            </Text>
            {showAllRounds ? (
              <Icon name="collapse" size="metadata" color={theme.accent} />
            ) : (
              <Icon name="expand" size="metadata" color={theme.accent} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Pot progress for the current round (api.rounds.getRound). The pot figure
 * is custody-captioned — it names who holds the money, never a bare balance
 * (00 red line). Tapping opens the round detail screen (Slice 1 entry).
 */
function CurrentRoundCard({
  groupId,
  roundId,
}: {
  groupId: Id<'groups'>;
  roundId: Id<'rounds'>;
}) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const round = useQuery(api.rounds.getRound, { roundId });

  if (round === undefined) {
    return <Skeleton className="h-[64px] rounded-lg" />;
  }
  if (round === null) return null;

  const pct =
    round.expectedTotal > 0
      ? Math.min(
          100,
          Math.round((round.confirmedTotal / round.expectedTotal) * 100)
        )
      : 0;
  const gatheringDate = new Date(round.dueAt).toLocaleDateString(
    toIntlLocale(i18n.language),
    { weekday: 'long', day: 'numeric', month: 'long' }
  );

  return (
    <View
      className="gap-sm p-md"
      style={{
        backgroundColor: theme.collectiveHero,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 28,
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 28,
        borderCurve: 'continuous',
      }}
    >
      <Text className="font-body-semi text-overline uppercase text-inverted-muted">
        {t('groups.cycle.nextGathering', { date: gatheringDate })}
      </Text>
      <Text className="font-heading text-headline text-inverted">
        {t('groups.cycle.receivesThisRound', {
          name: round.beneficiaryName,
        })}
      </Text>
      <Text className="font-body text-caption text-inverted-muted">
        {t('round.pot.custody', {
          confirmed: formatCurrencyXAF(round.confirmedTotal),
          expected: formatCurrencyXAF(round.expectedTotal),
          name: round.custodianName,
        })}
      </Text>
      <View className="h-[6px] overflow-hidden rounded-pill bg-scrim">
        <View
          className="h-full rounded-pill bg-highlight"
          style={{ width: `${pct}%` }}
        />
      </View>
      <AppButton
        label={t('groups.cycle.openGathering')}
        variant="highlight"
        size="sm"
        testID="open-round-detail"
        onPress={() =>
          router.push({
            pathname: '/groups/[groupId]/rounds/[roundId]',
            params: { groupId, roundId },
          })
        }
      />
    </View>
  );
}
