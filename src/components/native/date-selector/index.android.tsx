import { DateTimePicker, Host } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";

import { useAppTheme } from "@/lib/theme";

import type { DateSelectorProps } from "./types";

/** Material 3 inline picker, seeded from Quiet Collective's moss accent. */
export function DateSelector({ value, onChange }: DateSelectorProps) {
  const theme = useAppTheme();

  return (
    <Host
      matchContents={{ vertical: true, horizontal: false }}
      colorScheme={theme.mode}
      seedColor={theme.successDark}
      style={{ width: "100%" }}
    >
      <DateTimePicker
        initialDate={value.toISOString()}
        displayedComponents="date"
        showVariantToggle={false}
        color={theme.successDark}
        elementColors={{
          containerColor: theme.surface,
          headlineContentColor: theme.text,
          weekdayContentColor: theme.textMuted,
          subheadContentColor: theme.text,
          navigationContentColor: theme.successDark,
          dayContentColor: theme.text,
          selectedDayContentColor: theme.isDark
            ? theme.background
            : theme.textInverted,
          selectedDayContainerColor: theme.successDark,
          todayContentColor: theme.warningDark,
          todayDateBorderColor: theme.warning,
        }}
        onDateSelected={onChange}
        modifiers={[fillMaxWidth()]}
      />
    </Host>
  );
}
