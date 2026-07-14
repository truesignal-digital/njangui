import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../lib/theme';

/** Titled surface card — the building block of every stacked screen. */
export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <View
      className="mt-md rounded-2xl border border-border-subtle bg-surface p-md"
      style={{ ...theme.shadow('card'), borderCurve: 'continuous' }}
    >
      <Text className="pb-sm font-heading text-title-lg text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
