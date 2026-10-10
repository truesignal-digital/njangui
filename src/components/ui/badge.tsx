import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import type { IconName } from '@/lib/icons';
import { mobileUiConfig } from '@/lib/mobile-ui-config';
import { useAppTheme } from '@/lib/theme';
import { Icon } from '@/components/ui/icon';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'outline';

const CONTAINER_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted',
  accent: 'bg-accent-light',
  success: 'bg-success-bg',
  warning: 'bg-warning-bg',
  outline: 'border border-border bg-transparent',
};

const LABEL_TONES: Record<BadgeTone, string> = {
  neutral: 'text-muted',
  accent: 'text-foreground',
  success: 'text-success-dark',
  warning: 'text-warning-dark',
  outline: 'text-muted',
};

export function Badge({
  label,
  tone = 'neutral',
  className,
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-[3px] self-start rounded-pill px-xs py-[3px]',
        CONTAINER_TONES[tone],
        className
      )}
    >
      {icon}
      <Text className={cn('font-body-medium text-caption', LABEL_TONES[tone])}>{label}</Text>
    </View>
  );
}

/** Group status → badge tone (mirrors the web STATUS_BADGE_VARIANT map). */
export const GROUP_STATUS_TONE: Record<string, BadgeTone> = {
  setup: 'accent',
  active: 'success',
  paused: 'outline',
  between_cycles: 'outline',
  archived: 'outline',
};

export type PaymentState =
  | 'pending'
  | 'claimed'
  | 'confirmed'
  | 'disputed'
  | 'cancelled';

/**
 * Payment-state chips (03 §G): ALWAYS icon+word+color, never color alone.
 * Each state has its own icon name in ICONS: pending en attente · claimed
 * déclaré · confirmed confirmé · disputed contesté · cancelled annulé.
 */
export const PAYMENT_STATE_TONE: Record<PaymentState, { tone: BadgeTone }> = {
  pending: { tone: 'neutral' },
  claimed: { tone: 'accent' },
  confirmed: { tone: 'success' },
  disputed: { tone: 'warning' },
  cancelled: { tone: 'outline' },
};

const PAYMENT_STATE_ICON: Record<PaymentState, IconName> = {
  pending: 'pending',
  claimed: 'claimed',
  confirmed: 'confirmed',
  disputed: 'disputed',
  cancelled: 'cancelled',
};

export function PaymentStateBadge({
  state,
  label,
  className,
}: {
  state: PaymentState;
  label: string;
  className?: string;
}) {
  const theme = useAppTheme();
  const { tone } = PAYMENT_STATE_TONE[state];
  const iconColor: Record<BadgeTone, string> = {
    neutral: theme.textMuted,
    accent: theme.text,
    success: theme.successDark,
    warning: theme.warningDark,
    outline: theme.textMuted,
  };
  return (
    <Badge
      tone={tone}
      label={label}
      className={className}
      icon={
        // key={state} remounts on every transition → the icon pops in, so
        // pending→declared→confirmed is felt, not just repainted.
        <Animated.View
          key={state}
          entering={FadeIn.duration(
            mobileUiConfig.motion.successDuration
          ).reduceMotion(ReduceMotion.System)}
        >
          <Icon name={PAYMENT_STATE_ICON[state]} size="badge" color={iconColor[tone]} />
        </Animated.View>
      }
    />
  );
}
