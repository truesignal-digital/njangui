import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, environment } from "@expo/ui/swift-ui/modifiers";
import { useTranslation } from "react-i18next";

import { toIntlLocale } from "@/lib/app-locale";
import { useAppTheme } from "@/lib/theme";

import type { DateSelectorProps } from "./types";

/** SwiftUI graphical calendar: only the OS selection surface is native. */
export function DateSelector({
  value,
  onChange,
  accessibilityLabel,
}: DateSelectorProps) {
  const theme = useAppTheme();
  const { i18n } = useTranslation();
  const locale = toIntlLocale(
    i18n.resolvedLanguage ?? i18n.language,
  ).replace("-", "_");

  return (
    <Host
      matchContents={{ vertical: true, horizontal: false }}
      colorScheme={theme.mode}
      seedColor={theme.successDark}
      style={{ width: "100%" }}
    >
      <DatePicker
        title={accessibilityLabel}
        selection={value}
        displayedComponents={["date"]}
        onDateChange={onChange}
        modifiers={[
          datePickerStyle("graphical"),
          environment("locale", locale),
        ]}
      />
    </Host>
  );
}
