import type { ComponentType, ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import {
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  XCircleIcon,
} from 'react-native-heroicons/outline';
import { CheckCircleIcon } from 'react-native-heroicons/solid';

import { cn } from '../../lib/cn';
import { useAppTheme } from '../../lib/theme';

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
 * Heroicons per state: ClockIcon en attente · PaperAirplaneIcon déclaré ·
 * CheckCircleIcon confirmé · ExclamationTriangleIcon contesté · XCircleIcon
 * annulé.
 */
export const PAYMENT_STATE_TONE: Record<PaymentState, { tone: BadgeTone }> = {
  pending: { tone: 'neutral' },
  claimed: { tone: 'accent' },
  confirmed: { tone: 'success' },
  disputed: { tone: 'warning' },
  cancelled: { tone: 'outline' },
};

const PAYMENT_STATE_ICON: Record<
  PaymentState,
  ComponentType<{ size?: number; color?: string }>
> = {
  pending: ClockIcon,
  claimed: PaperAirplaneIcon,
  confirmed: CheckCircleIcon,
  disputed: ExclamationTriangleIcon,
  cancelled: XCircleIcon,
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
  const Icon = PAYMENT_STATE_ICON[state];
  return (
    <Badge
      tone={tone}
      label={label}
      className={className}
      icon={
        // key={state} remounts on every transition → the icon pops in, so
        // pending→declared→confirmed is felt, not just repainted.
        <Animated.View key={state} entering={ZoomIn.springify().damping(14)}>
          <Icon size={12} color={iconColor[tone]} />
        </Animated.View>
      }
    />
  );
}
