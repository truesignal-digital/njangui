import { Text, View } from 'react-native';

import { Pictogram } from '@/components/ui/pictogram';
import { PICTOGRAM_NAMES } from '@/lib/pictograms';
import { getAppTheme } from '@/lib/theme';

const SIZES = [24, 32, 48] as const;

/** DEV-only: every pictogram at 24, 32 and 48 on the light and dark palettes. */
export function PictogramGallery() {
  return (
    <View className="gap-sm">
      {(['light', 'dark'] as const).map((mode) => (
        <GalleryPanel key={mode} mode={mode} />
      ))}
    </View>
  );
}

function GalleryPanel({ mode }: { mode: 'light' | 'dark' }) {
  const palette = getAppTheme(mode);

  return (
    <View
      className="gap-xs rounded-xl border p-md"
      style={{ backgroundColor: palette.background, borderColor: palette.border }}
    >
      <Text className="font-body-semi text-caption uppercase" style={{ color: palette.textMuted }}>
        {mode}
      </Text>
      {PICTOGRAM_NAMES.map((name) => (
        <View key={name} className="flex-row items-center gap-md">
          <Text className="w-[88px] font-body text-caption" style={{ color: palette.text }}>
            {name}
          </Text>
          {SIZES.map((size) => (
            <Pictogram key={size} name={name} size={size} color={palette.text} />
          ))}
        </View>
      ))}
    </View>
  );
}
