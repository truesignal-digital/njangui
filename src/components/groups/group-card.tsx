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
};

export const GroupCard = memo(function GroupCard({ group }: { group: GroupListItem }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const shadow = useShadow();

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending card is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';

  const detailParts = [
    t('groups.memberCount', { count: group.memberCount }),
    formatCurrencyXAF(group.contributionAmount),
    t(`groups.schedule.${group.schedule}`),
  ];

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
        'rounded-xl border border-border-subtle bg-surface px-lg py-md active:bg-surface-muted',
        isPendingViewer && 'opacity-70'
      )}
      style={shadow('card')}
    >
      <View className="flex-row items-center gap-sm">
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
