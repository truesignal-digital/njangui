import type { ReactNode } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { cn } from '../../lib/cn';
import { haptics } from '../../lib/haptics';
import { useAppTheme } from '../../lib/theme';
import { SoftPressable } from './soft-pressable';

type ButtonVariant = 'primary' | 'highlight' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'lg' | 'sm';

const CONTAINER_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent active:bg-accent-hover',
  highlight: 'bg-highlight active:bg-highlight-hover',
  outline: 'border border-border bg-surface active:bg-surface-muted',
  ghost: 'bg-transparent active:bg-surface-muted',
  destructive: 'bg-destructive active:bg-destructive-dark',
};

const LABEL_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'font-body-semi text-body text-primary-fg',
  highlight: 'font-body-semi text-body text-highlight-fg',
  outline: 'font-body-semi text-body text-foreground',
  ghost: 'font-body-medium text-body text-muted',
  destructive: 'font-body-semi text-body text-inverted',
};

const CONTAINER_SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-cta rounded-lg px-lg',
  sm: 'min-h-[40px] rounded-md px-md',
};

/**
 * One-thumb button (piol idiom: NativeWind classNames, never StyleSheet).
 * `lg` is the 52px CTA height from mobile-ui-config spacing.cta.
 */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'start',
  className,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  className?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  const blocked = disabled || loading;

  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      testID={testID}
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      className={cn(
        'flex-row items-center justify-center gap-xs',
        CONTAINER_VARIANTS[variant],
        CONTAINER_SIZES[size],
        blocked && 'opacity-50',
        className
      )}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary'
              ? theme.primaryForeground
              : variant === 'highlight'
                ? theme.highlightForeground
              : variant === 'destructive'
                ? theme.textInverted
                : theme.accent
          }
        />
      ) : iconPosition === 'start' ? (
        icon
      ) : null}
      <Text className={LABEL_VARIANTS[variant]}>{label}</Text>
      {!loading && iconPosition === 'end' ? icon : null}
    </SoftPressable>
  );
}
