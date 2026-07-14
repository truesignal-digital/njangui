import { mobileUiConfig } from "./mobile-ui-config";

/**
 * Quiet Collective's app-owned icon contract. Heroicons use these three
 * optical sizes; system-owned tabs and pickers keep their native symbols.
 */
export const ICON_SIZE = {
  metadata: mobileUiConfig.dimensions.iconSm,
  control: mobileUiConfig.dimensions.iconMd,
  emphasis: mobileUiConfig.dimensions.iconLg,
} as const;
