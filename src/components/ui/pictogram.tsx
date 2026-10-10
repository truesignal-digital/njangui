import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PICTOGRAM_ART } from '@/components/pictograms';
import type { PictogramName } from '@/lib/pictograms';
import { useAppTheme } from '@/lib/theme';

type PictogramProps = {
  name: PictogramName;
  size?: number;
  color?: string;
  /** Announce the pictogram's name. Leave off when a visible word sits beside it. */
  labelled?: boolean;
};

/**
 * One-colour content pictogram (spending bags, money states). Drawn with
 * react-native-svg so it looks the same on iOS and Android; not a UI icon.
 */
export function Pictogram({ name, size = 24, color, labelled = false }: PictogramProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const Art = PICTOGRAM_ART[name];

  return (
    <View
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={labelled ? t(`pictograms.${name}`) : undefined}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Art size={size} color={color ?? theme.text} />
    </View>
  );
}
