import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { api, type Id } from '@/lib/convex-api';
import { groupInitials, groupSolid, resolveSeed } from '@/lib/group-colors';
import { useAppTheme } from '@/lib/theme';
import { toIntlLocale } from '@/lib/app-locale';
import { AppButton } from '@/components/ui/button';
import { NjangiMark } from '@/components/brand/njangi-mark';
import { Skeleton } from '@/components/skeleton';
import { mobileUiConfig } from '@/lib/mobile-ui-config';
import { Icon } from '@/components/ui/icon';

type TableMember = {
  membershipId: string;
  displayName: string;
};

/**
 * The approved Collective Table hero: people arranged around the real
 * Njangi mark. The mark expresses togetherness only; it never visualizes a
 * balance, collection total, or custody state.
 */
export function CollectiveTableCard({
  groupId,
  groupName,
  colorSeed,
  groupStatus,
  members,
}: {
  groupId: Id<'groups'>;
  groupName: string;
  colorSeed: number | null;
  groupStatus: string;
  members: TableMember[];
}) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const active = groupStatus === 'active';
  const cycle = useQuery(
    api.cycles.getActiveCycle,
    isAuthenticated && active ? { groupId } : ('skip' as const)
  );

  if (active && cycle === undefined) {
    return <Skeleton className="mt-lg h-[440px] rounded-2xl" />;
  }

  const currentRound = cycle?.rounds.find(
    (round) => round.roundId === cycle.currentRoundId
  );
  const date = currentRound
    ? new Date(currentRound.dueAt).toLocaleDateString(
        toIntlLocale(i18n.language),
        { day: 'numeric', month: 'long' }
      )
    : t('groups.table.forming');
  const seatMembers = members.slice(0, 5);
  const seed = resolveSeed(colorSeed, groupId);

  return (
    <View className="mt-lg gap-sm">
      <Animated.View
        entering={FadeIn.duration(
          mobileUiConfig.motion.enterDuration
        ).reduceMotion(ReduceMotion.System)}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={t('groups.table.accessibilityLabel', {
          group: groupName,
          date,
        })}
        className="h-[330px] overflow-hidden rounded-2xl border border-border-faint bg-accent-soft"
        style={{ borderCurve: 'continuous' }}
      >
        <Text className="absolute left-0 right-0 top-md text-center font-body-semi text-overline uppercase text-accent">
          {currentRound
            ? t('groups.table.receivesNext', {
                name: currentRound.beneficiaryName,
              })
            : t('groups.table.yourCircle')}
        </Text>

        {seatMembers.map((member, index) => {
          const position = SEAT_POSITIONS[index];
          return (
            <View
              key={member.membershipId}
              className="absolute h-[54px] w-[54px] items-center justify-center rounded-full border-4 border-accent-soft"
              style={{
                ...position,
                backgroundColor: groupSolid(seed + index * 60, theme.isDark),
              }}
            >
              <Text className="font-body-semi text-caption text-inverted">
                {groupInitials(member.displayName)}
              </Text>
            </View>
          );
        })}

        <View
          className="absolute h-[164px] w-[164px] items-center justify-center rounded-full bg-accent-hero"
          style={{ left: '50%', top: '50%', marginLeft: -82, marginTop: -66 }}
        >
          <NjangiMark size={142} color={theme.textInvertedMuted} />
          <View className="absolute h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-accent-soft bg-surface">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className="font-heading text-title-lg text-foreground"
            >
              {date}
            </Text>
            <Text className="mt-[2px] font-body text-caption text-muted">
              {currentRound
                ? t('groups.table.gatherTogether')
                : t('groups.table.invitePeople')}
            </Text>
          </View>
        </View>
      </Animated.View>

      {currentRound ? (
        <AppButton
          label={t('groups.table.prepareTogether')}
          icon={
            <Icon name="next" size="control" color={theme.primaryForeground} />
          }
          iconPosition="end"
          onPress={() =>
            router.push({
              pathname: '/groups/[groupId]/rounds/[roundId]',
              params: { groupId, roundId: currentRound.roundId },
            })
          }
        />
      ) : null}

      <View className="flex-row gap-xs">
        <TableSummary
          title={t('groups.table.peopleReady', { count: members.length })}
          detail={t('groups.table.recordsShared')}
        />
        <TableSummary
          title={
            currentRound
              ? currentRound.beneficiaryName
              : t('groups.table.circleForming')
          }
          detail={
            currentRound
              ? t('groups.table.receivesThisRound')
              : t('groups.table.addPeople')
          }
        />
      </View>
    </View>
  );
}

function TableSummary({ title, detail }: { title: string; detail: string }) {
  return (
    <View className="min-h-[72px] flex-1 justify-center rounded-xl border border-border bg-surface px-md">
      <Text numberOfLines={1} className="font-body-semi text-caption text-foreground">
        {title}
      </Text>
      <Text numberOfLines={1} className="font-body text-caption text-muted">
        {detail}
      </Text>
    </View>
  );
}

const SEAT_POSITIONS = [
  { top: 42, left: '50%', marginLeft: -27 },
  { top: 108, left: 30 },
  { top: 108, right: 30 },
  { bottom: 22, left: 78 },
  { bottom: 22, right: 78 },
] as const;
