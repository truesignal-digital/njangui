import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "react-native-heroicons/outline";

import { ICON_SIZE } from "@/lib/icons";
import { addMonths, monthGrid } from "@/lib/month-grid";
import { useAppTheme } from "@/lib/theme";

import type { DateSelectorProps } from "./types";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Month grid drawn in React Native. The Compose DatePicker reads the system
 * locale (`LocalConfiguration`) and takes no locale prop, so it ignored the
 * in-app FR/EN choice.
 */
export function DateSelector({
  value,
  onChange,
  accessibilityLabel,
}: DateSelectorProps) {
  const theme = useAppTheme();
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(() => ({
    year: value.getFullYear(),
    month: value.getMonth(),
  }));
  const grid = monthGrid(visible.year, visible.month, i18n.language);
  const today = new Date();

  const shift = (delta: number) =>
    setVisible((current) => addMonths(current.year, current.month, delta));

  return (
    <View className="gap-xs">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.previousMonth")}
          hitSlop={8}
          onPress={() => shift(-1)}
          className="h-[40px] w-[40px] items-center justify-center rounded-full"
        >
          <ChevronLeftIcon size={ICON_SIZE.control} color={theme.successDark} />
        </Pressable>
        <Text
          accessibilityRole="header"
          accessibilityHint={accessibilityLabel}
          className="font-body-semi text-body capitalize text-foreground"
        >
          {grid.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.nextMonth")}
          hitSlop={8}
          onPress={() => shift(1)}
          className="h-[40px] w-[40px] items-center justify-center rounded-full"
        >
          <ChevronRightIcon
            size={ICON_SIZE.control}
            color={theme.successDark}
          />
        </Pressable>
      </View>

      <View
        className="flex-row"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {grid.weekdays.map((weekday) => (
          <Text
            key={weekday.long}
            className="flex-1 text-center font-body text-caption capitalize text-muted"
          >
            {weekday.short}
          </Text>
        ))}
      </View>

      {grid.weeks.map((week, weekIndex) => (
        <View key={weekIndex} className="flex-row">
          {week.map((cell, dayIndex) => {
            if (!cell) return <View key={dayIndex} className="flex-1" />;
            const selected = isSameDay(cell.date, value);
            const isToday = isSameDay(cell.date, today);
            return (
              <View key={dayIndex} className="flex-1 items-center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isToday
                      ? t("calendar.todayLabel", { date: cell.label })
                      : cell.label
                  }
                  accessibilityState={{ selected }}
                  onPress={() => onChange(cell.date)}
                  className={`h-[40px] w-[40px] items-center justify-center rounded-full ${
                    selected
                      ? "bg-success-dark"
                      : isToday
                        ? "border border-warning"
                        : ""
                  }`}
                >
                  <Text
                    className={`font-body-semi text-body-sm ${
                      selected
                        ? "text-background"
                        : isToday
                          ? "text-warning-dark"
                          : "text-foreground"
                    }`}
                  >
                    {cell.day}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
