import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'react-native-heroicons/outline';

import { cn } from '../../lib/cn';
import { formatCurrencyXAF } from '../../lib/format-currency';
import { haptics } from '../../lib/haptics';
import { useAppTheme, useShadow } from '../../lib/theme';
import { Badge, GROUP_STATUS_TONE } from '../ui/badge';
import { GroupAvatar, GroupGradientWash } from '../ui/group-identity';

/**
 * Narrow data interface for the home group list — matches the `returns:`
 * validator of api.groups.listMyGroups (myGroupItemValidator).
 */
export type GroupListItem = {
  groupId: string;
  name: string;
  status: 'setup' | 'active' | 'paused' | 'between_cycles' | 'archived';
  schedule: 'weekly' | 'biweekly' | 'monthly';
  contributionAmount: number;
  memberCount: number;
  membershipId: string;
  role: 'president' | 'treasurer' | 'member';
  membershipStatus: string;
  colorSeed: number | null;
  cycleProgress: { done: number; total: number } | null;
  nextDueAt: number | null;
  myDue: { roundId: string; amount: number; dueAt: number } | null;
  receiving: { amount: number; date: number } | null;
};

export const GroupCard = memo(function GroupCard({ group }: { group: GroupListItem }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const shadow = useShadow();
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending card is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';

  const detailParts = [
    t('groups.memberCount', { count: group.memberCount }),
    formatCurrencyXAF(group.contributionAmount),
    t(`groups.schedule.${group.schedule}`),
  ];

  const nextDue =
    group.status === 'active' && group.nextDueAt !== null
      ? new Date(group.nextDueAt).toLocaleDateString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={group.name}
      disabled={isPendingViewer}
      onPress={() => {
        haptics.select();
        router.push({
          pathname: '/groups/[groupId]',
          params: { groupId: group.groupId },
        });
      }}
      className={cn(
        'overflow-hidden rounded-xl border border-border-subtle bg-surface px-lg py-md active:opacity-90',
        isPendingViewer && 'opacity-70'
      )}
      style={shadow('card')}
    >
      <GroupGradientWash
        colorSeed={group.colorSeed}
        groupId={group.groupId}
        opacity={0.45}
      />
      <View className="flex-row items-center gap-md">
        <GroupAvatar
          name={group.name}
          colorSeed={group.colorSeed}
          groupId={group.groupId}
          size={48}
          progress={group.cycleProgress}
        />
        <View className="min-w-0 flex-1 gap-xs">
          <View className="flex-row flex-wrap items-center gap-xs">
            <Text numberOfLines={1} className="shrink font-body-semi text-title text-foreground">
              {group.name}
            </Text>
            {group.role !== 'member' ? (
              <Badge tone="neutral" label={t(`groups.roles.${group.role}`)} />
            ) : null}
          </View>
          <Text numberOfLines={1} className="font-body text-body-sm text-muted">
            {detailParts.join(' · ')}
          </Text>
          {isPendingViewer ? (
            <Badge tone="outline" label={t('groups.memberStatus.pending_approval')} />
          ) : group.status === 'active' && group.cycleProgress ? (
            <Text numberOfLines={1} className="font-body-medium text-body-sm text-foreground">
              {t('groups.card.roundOf', {
                done: group.cycleProgress.done,
                total: group.cycleProgress.total,
              })}
              {nextDue ? ` · ${t('groups.card.nextDue', { date: nextDue })}` : ''}
            </Text>
          ) : (
            <Badge
              tone={GROUP_STATUS_TONE[group.status] ?? 'outline'}
              label={t(`groups.status.${group.status}`)}
            />
          )}
        </View>
        {!isPendingViewer ? (
          <ChevronRightIcon size={18} color={theme.textMuted} />
        ) : null}
      </View>
    </Pressable>
  );
});
