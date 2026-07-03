import { memo } from 'react';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'react-native-heroicons/outline';

import { cn } from '../../lib/cn';
import { toIntlLocale } from '../../lib/app-locale';
import { formatCurrencyXAF } from '../../lib/format-currency';
import { groupAccent, groupTint, resolveSeed } from '../../lib/group-colors';
import { haptics } from '../../lib/haptics';
import { useAppTheme, useShadow } from '../../lib/theme';
import { Badge } from '../ui/badge';
import { GroupAvatar } from '../ui/group-identity';

/**
 * Narrow data interface for the group lists — matches the `returns:`
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
  roundHealth: { confirmed: number; expected: number } | null;
  memberPreview: { initials: string; paid: boolean }[];
  currentReceiverName: string | null;
};

/**
 * Group-tab row (round-2 §2 option B, user-approved 2026-07-03): the
 * group's gradient disc carries the identity, ONE sub-line carries the
 * cycle fact, and the right edge shows a single chip only when something
 * awaits the viewer — otherwise a plain chevron. Calm over dense.
 */
export const GroupCard = memo(function GroupCard({ group }: { group: GroupListItem }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const shadow = useShadow();
  const dark = useColorScheme() === 'dark';
  const locale = toIntlLocale(i18n.language);

  const seed = resolveSeed(group.colorSeed, group.groupId);

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending row is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';
  const cycleRunning = group.status === 'active' && group.cycleProgress !== null;
  const dimmed =
    isPendingViewer || group.status === 'paused' || group.status === 'archived';

  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  // ONE sub-line: cycle position + next date, with an « à jour ✓ » tail
  // when every member's contribution for the collecting round is confirmed.
  let subLine: string;
  if (isPendingViewer) {
    subLine = t('groups.memberStatus.pending_approval');
  } else if (cycleRunning && group.cycleProgress) {
    const parts = [
      t('groups.card.roundOf', {
        done: group.cycleProgress.done,
        total: group.cycleProgress.total,
      }),
    ];
    if (group.nextDueAt !== null && group.nextDueAt >= Date.now()) {
      parts.push(shortDate(group.nextDueAt));
    }
    // != null also guards undefined — an old client bundle talking to a
    // newer/older deployment must degrade, not blank the row.
    const allPaid =
      group.roundHealth != null &&
      group.roundHealth.confirmed >= group.roundHealth.expected;
    if (allPaid) {
      parts.push(t('groups.card.upToDateInline'));
    }
    subLine = parts.join(' · ');
  } else {
    subLine = t(`groups.status.${group.status}`);
  }

  // Right edge: a single attention chip, or the chevron when nothing waits.
  const chip = isPendingViewer
    ? null
    : group.myDue
      ? {
          label: t('groups.card.dueChip', {
            amount: formatCurrencyXAF(group.myDue.amount),
          }),
          background: theme.warningBg,
          color: theme.warningDark,
        }
      : group.receiving
        ? {
            label: t('groups.card.yourTurn'),
            background: groupTint(seed, dark),
            color: groupAccent(seed, dark),
          }
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
        'flex-row items-center gap-md rounded-xl border border-border-subtle bg-surface px-md py-sm active:opacity-90',
        dimmed && 'opacity-60'
      )}
      style={shadow('card')}
    >
      <GroupAvatar
        name={group.name}
        colorSeed={group.colorSeed}
        groupId={group.groupId}
        size={52}
        progress={cycleRunning ? group.cycleProgress : null}
      />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-xs">
          <Text numberOfLines={1} className="shrink font-body-semi text-title text-foreground">
            {group.name}
          </Text>
          {group.role !== 'member' ? (
            <Badge tone="neutral" label={t(`groups.roles.${group.role}`)} />
          ) : null}
        </View>
        <Text numberOfLines={1} className="font-body text-body-sm text-muted">
          {subLine}
        </Text>
      </View>
      {chip ? (
        <View className="rounded-pill px-sm py-xs" style={{ backgroundColor: chip.background }}>
          <Text className="font-body-semi text-caption" style={{ color: chip.color }}>
            {chip.label}
          </Text>
        </View>
      ) : !isPendingViewer ? (
        <ChevronRightIcon size={18} color={theme.textPlaceholder} />
      ) : null}
    </Pressable>
  );
});
