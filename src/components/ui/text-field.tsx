import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '../../lib/cn';
import { useAppTheme } from '../../lib/theme';

/**
 * Labeled text input (52px min height — same one-thumb target as CTAs).
 * `prefix` renders a fixed chip before the input (e.g. +237).
 */
export const TextField = forwardRef<TextInput, TextInputProps & {
  label?: string;
  prefix?: string;
  error?: string | null;
  containerClassName?: string;
}>(function TextField({ label, prefix, error, containerClassName, className, ...inputProps }, ref) {
  const theme = useAppTheme();

  return (
    <View className={cn('gap-xs', containerClassName)}>
      {label ? <Text className="font-body-medium text-label text-foreground">{label}</Text> : null}
      <View className="flex-row items-center gap-xs">
        {prefix ? (
          <View className="min-h-cta items-center justify-center rounded-lg border border-border bg-surface-muted px-md">
            <Text className="font-body-medium text-body text-muted">{prefix}</Text>
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.textPlaceholder}
          selectionColor={theme.accent}
          className={cn(
            'min-h-cta flex-1 rounded-lg border bg-surface px-md font-body text-body text-foreground',
            error ? 'border-destructive' : 'border-border',
            className
          )}
          {...inputProps}
        />
      </View>
      {error ? <Text className="font-body text-body-sm text-destructive">{error}</Text> : null}
    </View>
  );
});
