import { Text, View } from 'react-native';

import { cn } from '../../lib/cn';

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
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'self-start rounded-pill px-xs py-[3px]',
        CONTAINER_TONES[tone],
        className
      )}
    >
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
 * Payment-state chips (03 §G): ALWAYS icon+word+color, never color alone —
 * the chip label is `${icon} ${t(`payments.state.${state}`)}`. Locked FR
 * terms: ○ en attente · ⏳ déclaré · ✓ confirmé · ⚠ contesté · ✕ annulé.
 */
export const PAYMENT_STATE_TONE: Record<
  PaymentState,
  { icon: string; tone: BadgeTone }
> = {
  pending: { icon: '○', tone: 'neutral' },
  claimed: { icon: '⏳', tone: 'accent' },
  confirmed: { icon: '✓', tone: 'success' },
  disputed: { icon: '⚠', tone: 'warning' },
  cancelled: { icon: '✕', tone: 'outline' },
};
