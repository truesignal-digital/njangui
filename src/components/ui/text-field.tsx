import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '../../lib/cn';
import { useAppTheme } from '../../lib/theme';

/**
 * Numeric keyboards only ever produce numbers: digit-only for
 * number/decimal pads (FCFA amounts are integers), digits plus a single
 * leading + for phone pads (pasted E.164). Hardware keyboards, paste and
 * autofill all bypass the soft keyboard, so the guard lives here.
 */
function sanitizeForKeyboard(
  text: string,
  keyboardType: TextInputProps['keyboardType']
): string {
  if (
    keyboardType === 'number-pad' ||
    keyboardType === 'numeric' ||
    keyboardType === 'decimal-pad'
  ) {
    return text.replace(/[^\d]/g, '');
  }
  if (keyboardType === 'phone-pad') {
    const cleaned = text.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+')
      ? `+${cleaned.slice(1).replace(/\+/g, '')}`
      : cleaned.replace(/\+/g, '');
  }
  return text;
}

/**
 * Labeled text input (52px min height — same one-thumb target as CTAs).
 * `prefix` renders a fixed chip before the input (e.g. +237).
 */
export const TextField = forwardRef<TextInput, TextInputProps & {
  label?: string;
  prefix?: string;
  error?: string | null;
  containerClassName?: string;
}>(function TextField({ label, prefix, error, containerClassName, className, onChangeText, keyboardType, ...inputProps }, ref) {
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
          keyboardType={keyboardType}
          onChangeText={
            onChangeText
              ? (text) => onChangeText(sanitizeForKeyboard(text, keyboardType))
              : undefined
          }
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
