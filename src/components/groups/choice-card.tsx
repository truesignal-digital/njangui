import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/lib/theme';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { Icon } from '@/components/ui/icon';

export function ChoiceCard({
  title,
  description,
  icon,
  selected = false,
  dominant = false,
  onPress,
  testID,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  selected?: boolean;
  dominant?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useAppTheme();
  const foreground = dominant ? theme.textInverted : selected ? theme.accent : theme.text;

  return (
    <SoftPressable
      accessibilityRole={selected ? 'radio' : 'button'}
      accessibilityState={selected ? { selected: true } : undefined}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      testID={testID}
      className={cn(
        'min-h-[88px] flex-row items-center gap-md rounded-2xl border px-lg py-md',
        dominant
          ? 'border-success-dark'
          : selected
            ? 'border-accent bg-accent-faint'
            : 'border-border-subtle bg-surface'
      )}
      style={{
        borderCurve: 'continuous',
        ...(dominant ? { backgroundColor: theme.collectiveHero } : theme.shadow('light')),
      }}
    >
      {icon ? (
        <View
          className={cn(
            'h-[42px] w-[42px] items-center justify-center rounded-full',
            dominant ? 'bg-overlay-light' : selected ? 'bg-accent-light' : 'bg-success-bg'
          )}
        >
          {icon}
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-[3px]">
        <Text
          className={cn(
            'font-body-semi text-title',
            dominant ? 'text-inverted' : 'text-foreground'
          )}
        >
          {title}
        </Text>
        {description ? (
          <Text
            className={cn(
              'font-body text-body-sm',
              dominant ? 'text-inverted-muted' : 'text-muted'
            )}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Icon name="check" size="control" color={foreground} />
      ) : (
        <Icon name="chevron" size="control" color={foreground} />
      )}
    </SoftPressable>
  );
}
