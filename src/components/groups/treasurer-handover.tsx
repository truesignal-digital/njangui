import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';
import { CheckCircleIcon } from 'react-native-heroicons/solid';

import { api, type Id } from '../../lib/convex-api';
import { formatCurrencyXAF } from '../../lib/format-currency';
import { haptics } from '../../lib/haptics';
import { useAppTheme } from '../../lib/theme';
import { AppButton } from '../ui/button';
import type { GroupMemberItem } from './member-list';

export function TreasurerHandover({
  groupId,
  members,
}: {
  groupId: string;
  members: GroupMemberItem[];
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const preview = useQuery(api.memberships.getTreasurerHandoverPreview, {
    groupId: groupId as Id<'groups'>,
  });
  const reassign = useMutation(api.memberships.reassignTreasurer);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const eligible = members.filter(
    (member) =>
      member.status === 'active' &&
      member.role === 'member' &&
      member.hasAccount
  );
  const selected = eligible.find((member) => member.membershipId === selectedId);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await reassign({
        groupId: groupId as Id<'groups'>,
        membershipId: selected.membershipId as Id<'memberships'>,
      });
      haptics.success();
      toast.success(t('groups.handover.done', { name: selected.displayName }));
      setSelectedId(null);
      setOpen(false);
    } catch (error) {
      haptics.error();
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <View className="gap-xs">
        <Text className="font-body text-body-sm text-muted">
          {t('groups.handover.current', {
            name: preview?.currentTreasurerName ?? '—',
          })}
        </Text>
        <AppButton
          variant="outline"
          label={t('groups.handover.open')}
          testID="open-treasurer-handover"
          onPress={() => setOpen(true)}
        />
      </View>
    );
  }

  return (
    <View className="gap-sm">
      <Text className="font-heading text-title text-foreground">
        {t('groups.handover.title')}
      </Text>
      <Text className="font-body text-body-sm text-muted">
        {t('groups.handover.choose')}
      </Text>

      <View className="gap-xs">
        {eligible.map((member) => {
          const active = member.membershipId === selectedId;
          return (
            <Pressable
              key={member.membershipId}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              testID={`handover-member-${member.membershipId}`}
              onPress={() => setSelectedId(member.membershipId)}
              className={
                active
                  ? 'min-h-[52px] flex-row items-center gap-sm rounded-lg border border-accent bg-accent-faint p-sm'
                  : 'min-h-[52px] flex-row items-center gap-sm rounded-lg border border-border bg-surface p-sm'
              }
            >
              <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-inverted-bg">
                <Text className="font-body-semi text-caption text-inverted">
                  {member.displayName
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part.charAt(0))
                    .join('')}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-body-semi text-body-sm text-foreground">
                  {member.displayName}
                </Text>
                <Text className="font-body text-caption text-muted">
                  {t('groups.handover.eligible')}
                </Text>
              </View>
              {active ? (
                <CheckCircleIcon size={20} color={theme.successDark} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selected && preview ? (
        <>
          <View className="rounded-lg border border-border-subtle bg-surface-muted p-sm">
            <Text className="font-body-semi text-body-sm text-foreground">
              {t('groups.handover.changes')}
            </Text>
            <Text className="pt-xs font-body text-body-sm text-muted">
              {t('groups.handover.pendingContributions', {
                count: preview.pendingContributionCount,
                name: selected.displayName,
              })}
            </Text>
            <Text className="pt-xs font-body text-body-sm text-muted">
              {t('groups.handover.pendingPayouts', {
                count: preview.pendingPayoutCount,
                name: selected.displayName,
              })}
            </Text>
          </View>
          <View className="rounded-lg border border-border-subtle bg-surface p-sm">
            <Text className="font-body-semi text-body-sm text-foreground">
              {t('groups.handover.unchanged')}
            </Text>
            <Text className="pt-xs font-body text-body-sm text-muted">
              {t('groups.handover.claimsStay', {
                count: preview.activeClaimCount,
                name: preview.currentTreasurerName ?? '—',
              })}
            </Text>
            <Text className="pt-xs font-body text-body-sm text-muted">
              {t('groups.handover.historyStays')}
            </Text>
          </View>
          <View className="rounded-lg border border-warning-dark bg-warning-bg p-sm">
            <Text className="font-body-semi text-caption uppercase text-warning-dark">
              {t('groups.handover.accordingToLedger')}
            </Text>
            <Text className="pt-xs font-body-semi text-body-sm text-foreground">
              {t('groups.handover.custody', {
                name: preview.currentTreasurerName ?? '—',
              })}
            </Text>
            <Text className="pt-xs font-mono text-title text-foreground">
              {formatCurrencyXAF(preview.custodyAmount)}
            </Text>
          </View>
          <AppButton
            label={t('groups.handover.confirm')}
            loading={busy}
            disabled={busy}
            testID="confirm-treasurer-handover"
            onPress={() => void submit()}
          />
        </>
      ) : null}
      <AppButton
        variant="ghost"
        label={t('common.cancel')}
        disabled={busy}
        onPress={() => {
          setSelectedId(null);
          setOpen(false);
        }}
      />
    </View>
  );
}
