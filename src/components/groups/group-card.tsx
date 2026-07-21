import { memo } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'react-native-heroicons/outline';

import { cn } from '../../lib/cn';
import { toIntlLocale } from '../../lib/app-locale';
import { formatCurrencyXAF } from '../../lib/format-currency';
import { groupSolid, resolveSeed } from '../../lib/group-colors';
import { haptics } from '../../lib/haptics';
import { useAppTheme, useShadow } from '../../lib/theme';
import { GroupSeal } from './group-seal';
import { SoftPressable } from '../ui/soft-pressable';
import { ICON_SIZE } from '../../lib/icons';
import type { GroupPurpose } from '../../lib/group-summary';
import { GroupPurposeTag } from './group-purpose-tag';

/**
 * Narrow data interface for the group lists — matches the `returns:`
 * validator of api.groups.listMyGroups (myGroupItemValidator).
 */
export type GroupListItem = {
  groupId: string;
  name: string;
  purpose?: GroupPurpose;
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
  const dark = theme.isDark;
  const locale = toIntlLocale(i18n.language);

  const seed = resolveSeed(group.colorSeed, group.groupId);

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending row is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';
  const cycleRunning = group.status === 'active' && group.cycleProgress !== null;
  const dimmed =
    isPendingViewer || group.status === 'paused' || group.status === 'archived';

  // No weekday: the sub-line shares the row with a due chip and must leave
  // the group name room before anything truncates.
  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    });

  const hasAttentionChip =
    !isPendingViewer && (group.myDue !== null || group.receiving !== null);

  // ONE sub-line: cycle position + next date, with an « à jour ✓ » tail
  // when every member's contribution for the collecting round is confirmed.
  let subLine: string;
  if (isPendingViewer) {
    subLine = t('groups.memberStatus.pending_approval');
  } else if (cycleRunning && group.cycleProgress) {
    const parts = [
      t('groups.card.currentRound', {
        n: Math.min(group.cycleProgress.done + 1, group.cycleProgress.total),
        total: group.cycleProgress.total,
      }),
    ];
    // The date only fits when the right edge is a bare chevron — a due/
    // receiving chip already says the urgent thing, so the date yields
    // rather than truncate mid-word next to it.
    if (
      !hasAttentionChip &&
      group.nextDueAt !== null &&
      group.nextDueAt >= Date.now()
    ) {
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
    // Status + amount/rhythm: a stable secondary identity so same-named
    // groups don't lean on the gradient disc alone.
    subLine = [
      t(`groups.status.${group.status}`),
      formatCurrencyXAF(group.contributionAmount),
      t(`groups.schedule.${group.schedule}`),
    ].join(' · ');
  }

  let statusTitle: string;
  let statusDetail: string;
  if (isPendingViewer) {
    statusTitle = t('groups.memberStatus.pending_approval');
    statusDetail = t('groups.card.waitingApproval');
  } else if (group.myDue) {
    statusTitle = t('groups.card.needsYou');
    statusDetail = t('groups.card.confirmRecord', {
      amount: formatCurrencyXAF(group.myDue.amount),
    });
  } else if (group.receiving) {
    statusTitle = t('groups.card.youReceiveNext');
    statusDetail = shortDate(group.receiving.date);
  } else if (group.currentReceiverName) {
    statusTitle = t('groups.card.receivesNext', {
      name: group.currentReceiverName,
    });
    statusDetail = group.nextDueAt ? shortDate(group.nextDueAt) : subLine;
  } else if (group.status === 'setup') {
    statusTitle = t('groups.card.chooseRhythm');
    statusDetail = t('groups.card.setupLine');
  } else {
    statusTitle = t(`groups.status.${group.status}`);
    statusDetail = subLine;
  }

  return (
    <SoftPressable
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
        'min-h-[132px] rounded-2xl border border-border-subtle bg-surface p-md active:bg-surface-muted',
        dimmed && 'opacity-60'
      )}
      style={shadow('card')}
    >
      <View className="flex-row items-center gap-sm">
        <GroupSeal
          name={group.name}
          colorSeed={group.colorSeed}
          groupId={group.groupId}
          size={56}
        />
        <View className="min-w-0 flex-1">
          <View className="mb-xs flex-row items-center gap-xs">
            <GroupPurposeTag purpose={group.purpose ?? 'savings'} compact />
            <Text className="font-body-semi text-overline uppercase text-muted">
              {t('groups.mode.njangi')}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            className="font-heading text-title-lg text-foreground"
          >
            {group.name}
          </Text>
          <Text numberOfLines={1} className="font-body text-caption text-muted">
            {t('groups.card.peopleRole', {
              count: group.memberCount,
              role: t(`groups.roles.${group.role}`),
            })}
          </Text>
        </View>
        {!isPendingViewer ? (
          <ChevronRightIcon
            size={ICON_SIZE.metadata}
            color={theme.textPlaceholder}
          />
        ) : null}
      </View>

      <View className="mt-md flex-row items-end justify-between gap-sm">
        <View className="flex-row items-center">
          {group.memberPreview.slice(0, 4).map((member, index) => (
            <View
              key={`${member.initials}-${index}`}
              className={cn(
                'h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-surface',
                index > 0 && '-ml-xs'
              )}
              style={{ backgroundColor: groupSolid(seed + index * 60, dark) }}
            >
              <Text className="font-body-semi text-caption text-inverted">
                {member.initials}
              </Text>
            </View>
          ))}
          {group.memberCount > 4 ? (
            <View
              className="-ml-xs h-[34px] min-w-[34px] items-center justify-center rounded-full border-2 border-surface px-xs"
              style={{ backgroundColor: theme.collectiveHero }}
            >
              <Text className="font-body-semi text-caption text-inverted">
                +{group.memberCount - 4}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="min-w-0 flex-1 items-end">
          <Text
            numberOfLines={1}
            className={cn(
              'font-body-semi text-caption text-success-dark',
              hasAttentionChip && 'text-warning-dark'
            )}
          >
            {statusTitle}
          </Text>
          <Text numberOfLines={1} className="font-body text-caption text-muted">
            {statusDetail}
          </Text>
        </View>
      </View>
    </SoftPressable>
  );
});
