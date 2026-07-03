import { memo } from 'react';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { toIntlLocale } from '../../lib/app-locale';
import { formatCurrencyXAF } from '../../lib/format-currency';
import {
  groupAccent,
  groupSolid,
  groupTint,
  resolveSeed,
} from '../../lib/group-colors';
import { haptics } from '../../lib/haptics';
import { useAppTheme, useShadow } from '../../lib/theme';
import { Badge } from '../ui/badge';
import { GroupAvatar, GroupGradientWash } from '../ui/group-identity';

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
 * Group-tab management card (round-2 §2). The group's hue is the card's
 * theme — verdict chip, roster discs, and the Cotiser button all derive
 * from the stored colorSeed (user decision 2026-07-03: the gradient color
 * flows through the card's controls, not just the wash).
 */
export const GroupCard = memo(function GroupCard({ group }: { group: GroupListItem }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const shadow = useShadow();
  const dark = useColorScheme() === 'dark';
  const locale = toIntlLocale(i18n.language);

  const seed = resolveSeed(group.colorSeed, group.groupId);
  const hueText = groupAccent(seed, dark);
  const hueFill = groupTint(seed, dark);
  const hueSolid = groupSolid(seed, dark);

  // getGroup/listMembers reject pending_approval viewers (convex/utils/auth
  // READ_ELIGIBLE_STATUSES) — a pending card is informational, not navigable.
  const isPendingViewer = group.membershipStatus === 'pending_approval';
  const cycleRunning = group.status === 'active' && group.cycleProgress !== null;

  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  // Row A right edge: the round-health verdict, in the group's own hue
  // when everyone has paid, neutral while people are still owing.
  const health = cycleRunning ? group.roundHealth : null;
  const allPaid = health !== null && health.confirmed >= health.expected;

  // Row C: where the cycle stands and whose turn it is.
  let roundLine: string | null = null;
  if (isPendingViewer) {
    roundLine = null;
  } else if (cycleRunning && group.cycleProgress) {
    const parts: string[] = [
      t('groups.card.roundOf', {
        done: group.cycleProgress.done,
        total: group.cycleProgress.total,
      }),
    ];
    if (group.receiving) {
      parts.push(t('groups.card.myTurn'));
    } else if (group.currentReceiverName) {
      parts.push(t('groups.card.beneficiary', { name: group.currentReceiverName }));
    }
    if (group.nextDueAt !== null && group.nextDueAt >= Date.now()) {
      parts.push(shortDate(group.nextDueAt));
    }
    roundLine = parts.join(' · ');
  } else if (group.status === 'setup') {
    roundLine = t('groups.card.setupLine');
  } else if (group.status === 'between_cycles') {
    roundLine = t('groups.card.betweenLine');
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

      {/* Row A — identity + verdict */}
      <View className="flex-row items-center gap-md">
        <GroupAvatar
          name={group.name}
          colorSeed={group.colorSeed}
          groupId={group.groupId}
          size={44}
          progress={group.cycleProgress}
        />
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-xs">
          <Text numberOfLines={1} className="shrink font-body-semi text-title text-foreground">
            {group.name}
          </Text>
          {group.role !== 'member' ? (
            <Badge tone="neutral" label={t(`groups.roles.${group.role}`)} />
          ) : null}
        </View>
        {isPendingViewer ? (
          <Badge tone="outline" label={t('groups.memberStatus.pending_approval')} />
        ) : health ? (
          <View
            className="rounded-pill px-sm py-xs"
            style={
              allPaid
                ? { backgroundColor: hueFill }
                : { borderWidth: 1, borderColor: theme.border }
            }
          >
            <Text
              className="font-body-semi text-caption"
              style={{ color: allPaid ? hueText : theme.textMuted }}
            >
              {allPaid
                ? t('groups.card.upToDate')
                : t('groups.card.pendingCount', {
                    count: health.expected - health.confirmed,
                  })}
            </Text>
          </View>
        ) : group.status !== 'active' ? (
          <Badge tone="outline" label={t(`groups.status.${group.status}`)} />
        ) : null}
      </View>

      {/* Row B — roster health */}
      {!isPendingViewer ? (
        <View className="mt-sm flex-row items-center gap-sm">
          {group.memberPreview.length > 0 ? (
            <View className="flex-row">
              {group.memberPreview.map((member, index) => (
                <View
                  key={`${member.initials}-${index}`}
                  className={cn(
                    'h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-surface',
                    index > 0 && '-ml-[9px]'
                  )}
                  style={{ backgroundColor: hueSolid }}
                >
                  <Text className="font-body-semi text-[9px] text-white">
                    {member.initials}
                  </Text>
                  {member.paid ? (
                    <View
                      className="absolute -bottom-[1px] -right-[1px] h-[9px] w-[9px] rounded-full border border-surface"
                      style={{ backgroundColor: theme.successDark }}
                    />
                  ) : null}
                </View>
              ))}
              {group.memberCount > group.memberPreview.length ? (
                <View className="-ml-[9px] h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-surface bg-surface-muted">
                  <Text className="font-body-semi text-[9px] text-muted">
                    +{group.memberCount - group.memberPreview.length}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text numberOfLines={1} className="shrink font-body text-body-sm text-muted">
            {health
              ? t('groups.card.paidOfMembers', {
                  paid: health.confirmed,
                  total: health.expected,
                })
              : t('groups.memberCount', { count: group.memberCount })}
          </Text>
        </View>
      ) : null}

      {/* Row C — round position / next step */}
      {roundLine ? (
        <Text numberOfLines={1} className="mt-xs font-body-medium text-body-sm text-foreground">
          {roundLine}
        </Text>
      ) : null}

      {/* Row D — quiet meta */}
      {!isPendingViewer ? (
        <Text numberOfLines={1} className="mt-xs font-body text-body-sm text-placeholder">
          {formatCurrencyXAF(group.contributionAmount)} · {t(`groups.schedule.${group.schedule}`)}
        </Text>
      ) : null}

      {/* Attention routing — one hue-solid action, only where I owe */}
      {group.myDue ? (
        <View className="mt-sm flex-row justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('groups.card.contribute', {
              amount: formatCurrencyXAF(group.myDue.amount),
            })}
            onPress={() => {
              haptics.select();
              router.push({
                pathname: '/groups/[groupId]/rounds/[roundId]/pay',
                params: { groupId: group.groupId, roundId: group.myDue!.roundId },
              });
            }}
            className="rounded-pill px-md py-xs active:opacity-85"
            style={{ backgroundColor: hueSolid }}
          >
            <Text className="font-body-semi text-body-sm text-white">
              {t('groups.card.contribute', {
                amount: formatCurrencyXAF(group.myDue.amount),
              })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});
