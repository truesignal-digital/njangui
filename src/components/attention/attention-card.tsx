import { Pressable, Text, View } from 'react-native';

import type {
  AttentionAction,
  AttentionCardModel,
} from '@/lib/attention-presentation';
import type { IconName } from '@/lib/icons';
import { haptics } from '@/lib/haptics';
import { useAppTheme, type AppTheme } from '@/lib/theme';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { AppButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

/**
 * One visual family per job: money out (accent), pot handover (accent,
 * gift), confirmations (success), disputes (danger), governance (muted) —
 * so a contribution and a handover read differently before the title does.
 */
const ACTION_VISUALS: Record<
  AttentionAction['kind'],
  {
    icon: IconName;
    boxClass: string;
    tint: (theme: AppTheme) => string;
  }
> = {
  resolve_dispute: {
    icon: 'disputed',
    boxClass: 'bg-warning-bg',
    tint: (theme) => theme.destructive,
  },
  confirm_records: {
    icon: 'actions',
    boxClass: 'bg-success-bg',
    tint: (theme) => theme.successDark,
  },
  run_meeting: {
    icon: 'groups',
    boxClass: 'bg-accent-light',
    tint: (theme) => theme.accent,
  },
  record_payout_handover: {
    icon: 'pot',
    boxClass: 'bg-accent-light',
    tint: (theme) => theme.accent,
  },
  confirm_payout_handover: {
    icon: 'pot',
    boxClass: 'bg-success-bg',
    tint: (theme) => theme.successDark,
  },
  record_contribution: {
    icon: 'cash',
    boxClass: 'bg-accent-light',
    tint: (theme) => theme.accent,
  },
  review_membership_requests: {
    icon: 'add-person',
    boxClass: 'bg-surface-muted',
    tint: (theme) => theme.textMuted,
  },
  assign_president: {
    icon: 'add-person',
    boxClass: 'bg-surface-muted',
    tint: (theme) => theme.textMuted,
  },
  prepare_draft_cycle: {
    icon: 'calendar',
    boxClass: 'bg-surface-muted',
    tint: (theme) => theme.textMuted,
  },
  lock_draft_cycle: {
    icon: 'locked',
    boxClass: 'bg-surface-muted',
    tint: (theme) => theme.textMuted,
  },
};

const TONE_BADGES: Record<AttentionCardModel['tone'], BadgeTone> = {
  accent: 'accent',
  danger: 'warning',
  neutral: 'neutral',
};

export function AttentionPrimaryCard({
  model,
  onPress,
}: {
  model: AttentionCardModel;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View
      className="relative gap-sm overflow-hidden bg-accent px-md pb-md pt-lg"
      style={{
        ...theme.shadow('floating'),
        backgroundColor: theme.accentHero,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 28,
        borderBottomLeftRadius: 10,
        borderCurve: 'continuous',
      }}
    >
      <View
        pointerEvents="none"
        className="absolute right-md top-sm h-[50px] w-[50px] rotate-[18deg] rounded-full border border-inverted-muted opacity-30"
      />
      <View className="max-w-[88%] gap-[4px]">
        <Text className="font-body-semi text-overline uppercase text-inverted-muted">
          {model.context}
        </Text>
        <Text selectable className="font-heading text-headline text-inverted">
          {model.title}
        </Text>
      </View>

      {model.amount ? (
        <Text selectable className="font-body-semi text-body text-inverted">
          {model.amount}
        </Text>
      ) : null}
      <Text selectable className="font-body text-body-sm text-inverted-muted">
        {model.detail}
      </Text>

      <AppButton
        label={model.cta}
        variant="highlight"
        size="sm"
        iconPosition="end"
        icon={<Icon name="next" size="metadata" color={theme.highlightForeground} />}
        onPress={onPress}
      />
    </View>
  );
}

export function AttentionRow({
  model,
  onPress,
  compact = false,
}: {
  model: AttentionCardModel;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useAppTheme();
  const visual = ACTION_VISUALS[model.kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${model.title}. ${model.detail}`}
      testID={`attention-row-${model.id}`}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className={`flex-row items-center gap-sm border border-border-subtle bg-surface active:bg-surface-muted ${
        compact ? 'min-h-[58px] rounded-xl px-sm py-xs' : 'min-h-[62px] rounded-xl px-sm py-xs'
      }`}
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className={`${
          'h-[34px] w-[34px] rounded-full'
        } items-center justify-center ${visual.boxClass}`}
      >
        <Icon name={visual.icon} size="metadata" color={visual.tint(theme)} />
      </View>
      <View className="min-w-0 flex-1 gap-[2px]">
        <Text numberOfLines={1} className="font-body-semi text-body text-foreground">
          {model.title}
        </Text>
        <Text numberOfLines={1} className="font-body text-body-sm text-muted">
          {compact ? model.context : `${model.amount ? `${model.amount} · ` : ''}${model.detail}`}
        </Text>
      </View>
      <View className="max-w-[96px] items-end gap-xs">
        {compact ? (
          <Text numberOfLines={1} className="font-body-semi text-caption text-foreground">
            {model.amount ?? model.deadline}
          </Text>
        ) : model.deadline ? (
          <Badge label={model.deadline} tone={TONE_BADGES[model.tone]} />
        ) : null}
        {!compact ? (
          <Icon name="next" size="metadata" color={theme.textMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}
