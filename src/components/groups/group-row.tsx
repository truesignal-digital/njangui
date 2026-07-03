import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { toIntlLocale } from '@/lib/app-locale';
import { cn } from '@/lib/cn';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { haptics } from '@/lib/haptics';
import { GroupAvatar } from '@/components/ui/group-identity';
import type { GroupListItem } from '@/components/groups/group-card';

/**
 * Compact money-first group row (money-hero home, iter-3): identity disc
 * with the cycle ring, one status line answering « et moi ? », and a
 * right-aligned signed amount — negative when I owe, positive (success)
 * when the next pot is mine. The roomier GroupCard stays on the Groupe tab.
 */
export const GroupRow = memo(function GroupRow({ group }: { group: GroupListItem }) {
  const { t, i18n } = useTranslation();
  const locale = toIntlLocale(i18n.language);

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending row is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';

  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  let statusLine: string;
  if (isPendingViewer) {
    statusLine = t('groups.memberStatus.pending_approval');
  } else if (group.myDue) {
    statusLine = t('home.row.due', {
      amount: formatCurrencyXAF(group.myDue.amount),
      date: shortDate(group.myDue.dueAt),
    });
  } else if (group.receiving) {
    statusLine = t('home.row.receiving', { date: shortDate(group.receiving.date) });
  } else if (group.status === 'active' && group.cycleProgress) {
    statusLine = t('groups.card.roundOf', {
      done: group.cycleProgress.done,
      total: group.cycleProgress.total,
    });
    if (group.nextDueAt !== null) {
      statusLine += ` · ${t('groups.card.nextDue', { date: shortDate(group.nextDueAt) })}`;
    }
  } else {
    statusLine = t(`groups.status.${group.status}`);
  }

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
        'flex-row items-center gap-sm rounded-lg border border-border-subtle bg-surface px-md py-sm active:opacity-90',
        isPendingViewer && 'opacity-70'
      )}
    >
      <GroupAvatar
        name={group.name}
        colorSeed={group.colorSeed}
        groupId={group.groupId}
        size={40}
        progress={group.cycleProgress}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="font-body-semi text-body text-foreground">
          {group.name}
        </Text>
        <Text numberOfLines={1} className="font-body text-body-sm text-muted">
          {statusLine}
        </Text>
      </View>
      {group.myDue ? (
        <Text className="font-body-semi text-body-sm text-foreground">
          {formatCurrencyXAF(-group.myDue.amount)}
        </Text>
      ) : group.receiving ? (
        <Text className="font-body-semi text-body-sm text-success-dark">
          {`+${formatCurrencyXAF(group.receiving.amount)}`}
        </Text>
      ) : (
        <Text className="font-body text-body-sm text-muted">—</Text>
      )}
    </Pressable>
  );
});
