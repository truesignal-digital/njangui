import { useMemo } from "react";
import { Text, View } from "react-native";

import { SoftPressable } from "@/components/ui/soft-pressable";
import { toIntlLocale } from "@/lib/app-locale";
import { useTranslation } from "react-i18next";

import type { DateSelectorProps } from "./types";

/** Non-mobile fallback used by web previews; iOS/Android resolve their native files. */
export function DateSelector({ value, onChange }: DateSelectorProps) {
  const { i18n } = useTranslation();
  const locale = toIntlLocale(i18n.language);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(value);
        date.setDate(value.getDate() + index - 3);
        return date;
      }),
    [value],
  );

  return (
    <View className="flex-row justify-between gap-xs">
      {days.map((date) => {
        const selected = date.toDateString() === value.toDateString();
        return (
          <SoftPressable
            key={date.toISOString().slice(0, 10)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(date)}
            className={`min-h-[56px] flex-1 items-center justify-center rounded-xl ${
              selected ? "bg-success" : "bg-surface-muted"
            }`}
          >
            <Text
              className={`font-body text-caption ${
                selected ? "text-inverted" : "text-muted"
              }`}
            >
              {date.toLocaleDateString(locale, { weekday: "narrow" })}
            </Text>
            <Text
              className={`font-body-semi text-body-sm ${
                selected ? "text-inverted" : "text-foreground"
              }`}
            >
              {date.getDate()}
            </Text>
          </SoftPressable>
        );
      })}
    </View>
  );
}

export type { DateSelectorProps } from "./types";
