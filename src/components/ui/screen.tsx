import type { ReactNode } from "react";
import { ScrollView, Text, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/lib/theme";

export function AppScreen({
  children,
  scrollProps,
}: {
  children: ReactNode;
  scrollProps?: Omit<ScrollViewProps, "contentContainerStyle"> & {
    contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  };
}) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
      contentContainerStyle={[
        {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.md,
        },
        scrollProps?.contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function ScreenHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-md">
      <View className="min-w-0 flex-1 gap-xs">
        {eyebrow ? (
          <Text className="font-body-semi text-overline uppercase text-success-dark">
            {eyebrow}
          </Text>
        ) : null}
        <Text
          selectable
          className="font-heading text-display-lg text-foreground"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text selectable className="font-body text-body-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="font-body-semi text-overline uppercase text-muted">
      {children}
    </Text>
  );
}

export function QuietCard({
  children,
  tone = "surface",
}: {
  children: ReactNode;
  tone?: "surface" | "sage" | "plum" | "terracotta";
}) {
  const theme = useAppTheme();
  const toneClass = {
    surface: "border-border-subtle bg-surface",
    sage: "border-success bg-success-bg",
    plum: "border-accent bg-accent",
    terracotta: "border-warning bg-warning-bg",
  }[tone];

  return (
    <View
      className={`rounded-2xl border p-lg ${toneClass}`}
      style={{ ...theme.shadow("card"), borderCurve: "continuous" }}
    >
      {children}
    </View>
  );
}
