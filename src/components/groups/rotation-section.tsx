import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  PlayIcon,
} from 'react-native-heroicons/outline';

import { api, type Id } from '../../lib/convex-api';
import { formatCurrencyXAF } from '../../lib/format-currency';
import { useAppTheme } from '../../lib/theme';
import { AppButton } from '../ui/button';
import { Skeleton } from '../skeleton';

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
          <ClockIcon size={20} color={theme.textMuted} />
          <Text className="flex-1 font-body text-body-sm text-muted">
            {canStart
              ? t('groups.cycle.setupReady')
              : t('groups.cycle.setupWaiting')}
          </Text>
        </View>
        {canStart ? (
          <AppButton
            label={t('groups.cycle.startCta')}
            icon={<PlayIcon size={18} color={theme.primaryForeground} />}
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

  return (
    <View className="gap-md">
      {/* Cycle header + locked badge */}
      <View className="flex-row items-center justify-between">
        <Text className="font-body-semi text-body text-foreground">
          {t('groups.cycle.cycleN', { n: cycle.index })}
        </Text>
        <View className="flex-row items-center gap-xs rounded-pill bg-surface-muted px-sm py-[2px]">
          <LockClosedIcon size={13} color={theme.textMuted} />
          <Text className="font-body-medium text-caption text-muted">
            {t('groups.cycle.locked')}
          </Text>
        </View>
      </View>

      {/* Current round pot card */}
      {currentRound ? (
        <CurrentRoundCard roundId={currentRound.roundId} />
      ) : null}

      {/* Rotation list */}
      <View className="gap-xs">
        {cycle.rounds.map((round) => {
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
                <CheckCircleIcon size={16} color={theme.textMuted} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Pot progress for the current round (api.rounds.getRound). */
function CurrentRoundCard({ roundId }: { roundId: Id<'rounds'> }) {
  const { t } = useTranslation();
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

  return (
    <View className="gap-xs rounded-lg border border-border-subtle bg-surface p-md">
      <View className="flex-row items-center justify-between">
        <Text className="font-body-medium text-body-sm text-muted">
          {t('groups.cycle.roundN', { n: round.index })} ·{' '}
          {round.beneficiaryName}
        </Text>
        <Text className="font-body-semi text-body-sm text-foreground">
          {formatCurrencyXAF(round.confirmedTotal)} /{' '}
          {formatCurrencyXAF(round.expectedTotal)}
        </Text>
      </View>
      <View className="h-[8px] overflow-hidden rounded-pill bg-surface-muted">
        <View
          className="h-full rounded-pill bg-accent"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </View>
    </View>
  );
}
