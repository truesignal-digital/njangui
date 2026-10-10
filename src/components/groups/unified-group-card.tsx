import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { toIntlLocale } from '@/lib/app-locale';
import { formatCurrencyXAF } from '@/lib/format-currency';
import type { GroupSummary } from '@/lib/group-summary';
import { useAppTheme } from '@/lib/theme';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { GroupPurposeTag } from '@/components/groups/group-purpose-tag';
import { Icon } from '@/components/ui/icon';

export function UnifiedGroupCard({
  group,
  onPress,
}: {
  group: GroupSummary;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const locale = toIntlLocale(i18n.language);
  const shortDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    });

  const isContribution = group.mode === 'contribution';
  let primaryFact: string;
  let secondaryFact: string;

  if (isContribution) {
    primaryFact = group.goalAmount
      ? t('groups.summary.confirmedToward', {
          confirmed: formatCurrencyXAF(group.confirmedAmount),
          goal: formatCurrencyXAF(group.goalAmount),
        })
      : t('groups.summary.confirmedAmount', {
          amount: formatCurrencyXAF(group.confirmedAmount),
        });
    secondaryFact = group.awaitingConfirmationCount > 0
      ? t('groups.summary.contributionMeta', {
          count: group.awaitingConfirmationCount,
          date: shortDate(group.deadlineAt),
        })
      : t('groups.summary.deadlineOnly', {
          date: shortDate(group.deadlineAt),
        });
  } else if (group.viewerDueAmount !== null) {
    primaryFact = t('groups.summary.youOwe', {
      amount: formatCurrencyXAF(group.viewerDueAmount),
    });
    secondaryFact = group.nextDueAt
      ? t('groups.summary.nextDate', { date: shortDate(group.nextDueAt) })
      : t(`groups.status.${group.status}`);
  } else if (group.viewerReceivingAmount !== null) {
    primaryFact = t('groups.summary.youReceive', {
      amount: formatCurrencyXAF(group.viewerReceivingAmount),
    });
    secondaryFact = group.nextDueAt
      ? t('groups.summary.nextDate', { date: shortDate(group.nextDueAt) })
      : t(`groups.status.${group.status}`);
  } else {
    primaryFact = t(`groups.status.${group.status}`);
    secondaryFact = group.nextDueAt
      ? t('groups.summary.nextDate', { date: shortDate(group.nextDueAt) })
      : t('groups.summary.noDate');
  }

  const accessibilityLabel = [
    t(`groups.purpose.${group.purpose}`),
    group.title,
    primaryFact,
    secondaryFact,
  ].join('. ');

  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="min-h-[140px] gap-md rounded-2xl border border-border-subtle bg-surface p-md active:bg-surface-muted"
      style={{ borderCurve: 'continuous', ...theme.shadow('card') }}
    >
      <View className="flex-row items-start gap-sm">
        <View
          className={
            isContribution
              ? 'h-[44px] w-[44px] items-center justify-center rounded-full bg-warning-bg'
              : 'h-[44px] w-[44px] items-center justify-center rounded-full bg-success-bg'
          }
        >
          {isContribution ? (
            <Icon name="cash" size="emphasis" color={theme.warningDark} />
          ) : (
            <Icon name="rotation" size="emphasis" color={theme.successDark} />
          )}
        </View>

        <View className="min-w-0 flex-1 gap-xs">
          <View className="flex-row flex-wrap items-center gap-xs">
            <GroupPurposeTag purpose={group.purpose} compact />
            <Text className="font-body-semi text-overline uppercase text-muted">
              {t(`groups.mode.${group.mode}`)}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            className="font-heading text-title-lg text-foreground"
          >
            {group.title}
          </Text>
        </View>

        <Icon name="chevron" size="control" color={theme.textPlaceholder} />
      </View>

      <View className="gap-xs border-t border-border-subtle pt-sm">
        <Text className="font-body-semi text-body text-foreground">
          {primaryFact}
        </Text>
        <View className="flex-row flex-wrap items-center justify-between gap-xs">
          <Text className="font-body text-caption text-muted">
            {secondaryFact}
          </Text>
          {group.viewerActionCount > 0 ? (
            <View className="rounded-pill bg-warning-bg px-sm py-xs">
              <Text className="font-body-semi text-caption text-warning-dark">
                {t('groups.summary.needsYou')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SoftPressable>
  );
}
