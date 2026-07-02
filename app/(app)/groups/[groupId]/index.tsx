import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, PlusIcon } from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../src/lib/convex-api';
import { useAuth } from '../../../../src/lib/clerk-client';
import { formatCurrencyXAF } from '../../../../src/lib/format-currency';
import { useAppTheme, useShadow } from '../../../../src/lib/theme';
import { Badge, GROUP_STATUS_TONE } from '../../../../src/components/ui/badge';
import { AppButton } from '../../../../src/components/ui/button';
import { Skeleton } from '../../../../src/components/skeleton';
import { ActivityFeed } from '../../../../src/components/groups/activity-feed';
import { ReadinessCard } from '../../../../src/components/groups/readiness-card';
import { InviteShare } from '../../../../src/components/groups/invite-share';
import { MemberList } from '../../../../src/components/groups/member-list';
import { RotationSection } from '../../../../src/components/groups/rotation-section';

/**
 * Group home shell (docs/03 B2, Week 1 slice): roster with roles + status
 * chips, approval queue, invite code, feature-phone add. Rotation order,
 * rounds and « Démarrer le cycle » are Week 2 — placeholder section below.
 */
export default function GroupHomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();

  const queryArgs =
    isAuthenticated && groupId
      ? { groupId: groupId as Id<'groups'> }
      : ('skip' as const);
  const group = useQuery(api.groups.getGroup, queryArgs);
  const members = useQuery(api.memberships.listMembers, queryArgs);

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || group === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <View className="flex-row items-center gap-xs">
          <Skeleton className="h-[36px] w-[36px] rounded-md" />
          <Skeleton className="h-[26px] w-[190px]" />
        </View>
        <View className="mt-xl gap-lg">
          <Skeleton className="h-[160px] rounded-xl" />
          <Skeleton className="h-[220px] rounded-xl" />
          <Skeleton className="h-[96px] rounded-xl" />
        </View>
      </View>
    );
  }

  if (group === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background px-lg">
        <Text className="text-center font-body text-body text-muted">
          {t('groups.detail.notFound')}
        </Text>
        <AppButton
          variant="ghost"
          label={t('groups.detail.backHome')}
          onPress={() => router.replace('/')}
        />
      </View>
    );
  }

  const canManage =
    group.viewerStatus === 'active' &&
    (group.viewerRole === 'president' || group.viewerRole === 'treasurer');

  // « Vous » star — derived from getGroup's viewerMembershipId (listMembers
  // rows are viewer-agnostic).
  const roster = (members ?? []).map((m) => ({
    ...m,
    isMe: m.membershipId === group.viewerMembershipId,
  }));
  const pendingMembers = roster.filter((m) => m.status === 'pending_approval');
  const activeMembers = roster.filter((m) => m.status === 'active');
  // Treasurer-created groups start president-less (02 §a: the creator picks
  // their real role) but the cycle lock REQUIRES a president — until one is
  // named, the treasurer sees a banner + a per-member action.
  const hasPresident = activeMembers.some((m) => m.role === 'president');
  const canAssignPresident =
    members !== undefined && !hasPresident && group.viewerRole === 'treasurer';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={screenPadding}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-start gap-xs">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
          className="mt-[2px] h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <View className="min-w-0 flex-1 gap-xs">
          <Text
            numberOfLines={1}
            className="font-heading text-headline text-foreground"
          >
            {group.name}
          </Text>
          <Badge
            tone={GROUP_STATUS_TONE[group.status] ?? 'outline'}
            label={t(`groups.status.${group.status}`)}
          />
        </View>
      </View>

      {/* Setup readiness — the lock guards made visible, plus the projected
          season so "do we wait for one more member?" has a visible cost */}
      {group.status === 'setup' && members !== undefined ? (
        <ReadinessCard
          activeMemberCount={activeMembers.length}
          targetMemberCount={group.targetMemberCount}
          hasPresident={hasPresident}
          hasTreasurer={activeMembers.some((m) => m.role === 'treasurer')}
          schedule={group.schedule}
          meetingDayOfWeek={group.meetingDayOfWeek}
        />
      ) : null}

      {/* Pending approvals — problems float up (president/treasurer only) */}
      {canManage && pendingMembers.length > 0 ? (
        <SectionCard
          title={`${t('groups.detail.pendingTitle')} (${pendingMembers.length})`}
        >
          <MemberList members={pendingMembers} canManage={canManage} />
        </SectionCard>
      ) : null}

      {/* Member roster */}
      <SectionCard
        title={
          members
            ? `${t('groups.detail.membersTitle')} · ${t('groups.memberCount', {
                count: activeMembers.length,
              })}`
            : t('groups.detail.membersTitle')
        }
      >
        {members === undefined ? (
          <View className="gap-sm">
            <Skeleton className="h-[48px] rounded-md" />
            <Skeleton className="h-[48px] rounded-md" />
            <Skeleton className="h-[48px] rounded-md" />
          </View>
        ) : (
          <MemberList
            members={activeMembers}
            canManage={canManage}
            canAssignPresident={canAssignPresident}
            groupId={group._id}
          />
        )}
        {canManage ? (
          <AppButton
            variant="outline"
            label={t('groups.detail.addMember')}
            icon={<PlusIcon size={18} color={theme.accent} />}
            className="mt-sm"
            onPress={() =>
              router.push({
                pathname: '/groups/[groupId]/add-member',
                params: { groupId: group._id },
              })
            }
          />
        ) : null}
      </SectionCard>

      {/* Invite (president/treasurer) */}
      {canManage ? (
        <SectionCard title={t('groups.invite.title')}>
          <InviteShare inviteCode={group.inviteCode} groupName={group.name} />
        </SectionCard>
      ) : null}

      {/* Rotation / rounds — state-driven (setup → start CTA, active → live order) */}
      <SectionCard title={t('groups.detail.rotationTitle')}>
        <RotationSection
          groupId={group._id}
          groupStatus={group.status}
          viewerRole={group.viewerRole}
          activeMemberCount={activeMembers.length}
        />
      </SectionCard>

      {/* Activity feed — 5-item preview; the full immutable ledger lives on
          its own paginated page (decision 6: the history IS the product) */}
      <SectionCard title={t('feed.title')}>
        <ActivityFeed groupId={group._id} compact />
        <AppButton
          variant="ghost"
          size="sm"
          label={t('feed.seeAll')}
          onPress={() =>
            router.push({
              pathname: '/groups/[groupId]/activity',
              params: { groupId: group._id },
            })
          }
          testID="see-all-activity"
        />
      </SectionCard>

      {/* Group rules */}
      <SectionCard title={t('groups.detail.rulesTitle')}>
        <View className="gap-sm">
          <RuleRow
            label={t('groups.detail.contribution')}
            value={t('groups.detail.perMember', {
              amount: formatCurrencyXAF(group.contributionAmount),
            })}
            emphasized
          />
          <RuleRow
            label={t('groups.detail.rhythm')}
            value={
              t(`groups.schedule.${group.schedule}`) +
              (typeof group.meetingDayOfWeek === 'number'
                ? ` · ${t(`groups.days.${group.meetingDayOfWeek}`)}`
                : '')
            }
          />
          <RuleRow
            label={t('groups.detail.collection')}
            value={t(`groups.collectionMode.${group.collectionMode}`)}
          />
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const shadow = useShadow();

  return (
    <View
      className="mt-lg rounded-xl border border-border-subtle bg-surface p-lg"
      style={shadow('card')}
    >
      <Text className="pb-sm font-body-semi text-title text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RuleRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-xs">
      <Text className="font-body text-body-sm text-muted">{label}</Text>
      <Text
        className={
          emphasized
            ? 'font-body-semi text-body text-foreground'
            : 'font-body-medium text-body-sm text-foreground'
        }
      >
        {value}
      </Text>
    </View>
  );
}
