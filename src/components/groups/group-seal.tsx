import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import {
  groupAccent,
  groupInitials,
  groupTint,
  resolveSeed,
} from '@/lib/group-colors';
import { useAppTheme } from '@/lib/theme';

const MARK = require('../../../assets/adaptive-icon-monochrome.png');

/** A group identity made from the Njangi mark, not a progress ring. */
export function GroupSeal({
  name,
  colorSeed,
  groupId,
  size = 56,
}: {
  name: string;
  colorSeed: number | null;
  groupId: string;
  size?: number;
}) {
  const theme = useAppTheme();
  const seed = resolveSeed(colorSeed, groupId);
  const accent = groupAccent(seed, theme.isDark);
  const tint = groupTint(seed, theme.isDark);
  const markSize = size * 1.02;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint,
      }}
    >
      <Image
        source={MARK}
        contentFit="contain"
        tintColor={accent}
        style={{ width: markSize, height: markSize }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.28,
          height: size * 0.28,
          borderRadius: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint,
        }}
      >
        <Text
          style={{
            color: accent,
            fontFamily: theme.fonts.bodyBold,
            fontSize: size * 0.13,
          }}
        >
          {groupInitials(name)}
        </Text>
      </View>
    </View>
  );
}
