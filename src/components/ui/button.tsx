import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { cn } from '../../lib/cn';
import { haptics } from '../../lib/haptics';
import { useAppTheme } from '../../lib/theme';

type ButtonVariant = 'primary' | 'outline' | 'ghost';
type ButtonSize = 'lg' | 'sm';

const CONTAINER_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent active:bg-accent-hover',
  outline: 'border border-border bg-surface active:bg-surface-muted',
  ghost: 'bg-transparent active:bg-surface-muted',
};

const LABEL_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'font-body-semi text-body text-primary-fg',
  outline: 'font-body-semi text-body text-foreground',
  ghost: 'font-body-medium text-body text-muted',
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
  className?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  const blocked = disabled || loading;

  return (
    <Pressable
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
          color={variant === 'primary' ? theme.primaryForeground : theme.accent}
        />
      ) : (
        icon
      )}
      <Text className={LABEL_VARIANTS[variant]}>{label}</Text>
    </Pressable>
  );
}
