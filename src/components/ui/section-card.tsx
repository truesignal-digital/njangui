import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useShadow } from '../../lib/theme';

/** Titled surface card — the building block of every stacked screen. */
export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const shadow = useShadow();

  return (
    <View
      className="mt-lg rounded-xl border border-border-subtle bg-surface p-lg"
      style={shadow('card')}
    >
      <Text className="pb-sm font-body-semi text-title text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
