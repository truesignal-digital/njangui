import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';

import { api, type Id } from '../../lib/convex-api';
import { haptics } from '../../lib/haptics';
import { Badge } from '../ui/badge';
import { AppButton } from '../ui/button';

/**
 * Narrow member-row interface — matches the `returns:` validator of
 * api.memberships.listMembers (memberListItemValidator). `isMe` is derived
 * client-side from getGroup's viewerMembershipId.
 */
export type GroupMemberItem = {
  membershipId: string;
  displayName: string;
  role: 'president' | 'treasurer' | 'member';
  status: string;
  joinedAt: number;
  joinedMidCycle?: boolean;
  hasAccount: boolean;
  phone?: string;
  isMe?: boolean;
};

function MemberAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View className="h-[40px] w-[40px] items-center justify-center rounded-full bg-surface-muted">
      <Text className="font-body-semi text-body-sm text-muted">{initial}</Text>
    </View>
  );
}

function MemberRow({ member, canManage }: { member: GroupMemberItem; canManage: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const approveMember = useMutation(api.memberships.approveMember);
  const rejectMember = useMutation(api.memberships.rejectMember);

  const isPending = member.status === 'pending_approval';

  const handleApprove = async () => {
    setBusy('approve');
    try {
      await approveMember({ membershipId: member.membershipId as Id<'memberships'> });
      haptics.success();
      toast.success(t('groups.detail.approvedToast', { name: member.displayName }));
    } catch {
      haptics.error();
      toast.error(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    try {
      await rejectMember({ membershipId: member.membershipId as Id<'memberships'> });
      toast.success(t('groups.detail.rejectedToast'));
    } catch {
      haptics.error();
      toast.error(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="min-h-[56px] flex-row items-center gap-sm py-xs">
      <MemberAvatar name={member.displayName} />
      <View className="min-w-0 flex-1 gap-[2px]">
        <View className="flex-row flex-wrap items-center gap-[6px]">
          <Text numberOfLines={1} className="shrink font-body-medium text-body text-foreground">
            {member.displayName}
          </Text>
          {member.isMe ? (
            <Text className="font-body-semi text-caption text-accent">
              ★ {t('groups.detail.you')}
            </Text>
          ) : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-[6px]">
          {member.role !== 'member' ? (
            <Badge tone="accent" label={t(`groups.roles.${member.role}`)} />
          ) : null}
          {!member.hasAccount ? (
            <Badge tone="outline" label={t('groups.detail.noApp')} />
          ) : null}
          {member.status !== 'active' ? (
            <Badge tone="outline" label={t(`groups.memberStatus.${member.status}`)} />
          ) : null}
        </View>
      </View>
      {isPending && canManage ? (
        <View className="flex-row items-center gap-xs">
          <AppButton
            size="sm"
            label={t('groups.detail.approve')}
            disabled={busy !== null}
            loading={busy === 'approve'}
            onPress={() => void handleApprove()}
          />
          <AppButton
            size="sm"
            variant="outline"
            label={t('groups.detail.reject')}
            disabled={busy !== null}
            loading={busy === 'reject'}
            onPress={() => void handleReject()}
          />
        </View>
      ) : null}
    </View>
  );
}

export function MemberList({
  members,
  canManage,
}: {
  members: GroupMemberItem[];
  canManage: boolean;
}) {
  return (
    <View>
      {members.map((member, index) => (
        <View
          key={member.membershipId}
          className={index > 0 ? 'border-t border-border-faint' : undefined}
        >
          <MemberRow member={member} canManage={canManage} />
        </View>
      ))}
    </View>
  );
}
