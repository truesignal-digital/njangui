import { Text } from 'react-native';

import { cn } from '@/lib/cn';

const SIZE_CLASS = {
  hero: 'text-money-hero',
  row: 'text-money',
} as const;

const TONE_CLASS = {
  default: 'text-foreground',
  onHighlight: 'text-highlight-fg',
} as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * The one money style: rounded bold with tabular figures. `children` is the
 * already-formatted string from formatCurrencyXAF(); `className` is for
 * layout only (margin/padding), colour comes from `tone`.
 */
export function MoneyText({
  children,
  size,
  tone = 'default',
  selectable,
  className,
}: {
  children: string;
  size: keyof typeof SIZE_CLASS;
  tone?: keyof typeof TONE_CLASS;
  selectable?: boolean;
  className?: string;
}) {
  return (
    <Text
      selectable={selectable}
      className={cn('font-money', SIZE_CLASS[size], TONE_CLASS[tone], className)}
      style={TABULAR}
    >
      {children}
    </Text>
  );
}
