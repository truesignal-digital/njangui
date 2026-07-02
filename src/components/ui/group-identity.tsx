import { Text, View, useColorScheme } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  groupAccent,
  groupAvatarGradient,
  groupGradient,
  groupInitials,
  resolveSeed,
} from '../../lib/group-colors';

/**
 * Per-njangi identity primitives (03 §G spirit: recognizable, never loud).
 * Rendered with react-native-svg (already a heroicons dependency) — no
 * extra native module, cheap on low-end Androids.
 */

let gradientCounter = 0;

/** Absolute-fill subtle wash. Parent needs `overflow-hidden` + a radius. */
export function GroupGradientWash({
  colorSeed,
  groupId,
  opacity = 1,
}: {
  colorSeed: number | null;
  groupId: string;
  opacity?: number;
}) {
  const dark = useColorScheme() === 'dark';
  const seed = resolveSeed(colorSeed, groupId);
  const { start, end } = groupGradient(seed, dark);
  const gid = `wash-${seed}-${(gradientCounter = (gradientCounter + 1) % 1e6)}`;
  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', top: 0, left: 0, opacity }}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={start} />
          <Stop offset="1" stopColor={end} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
    </Svg>
  );
}

/**
 * Gradient initials disc, optionally wrapped in a cycle-progress ring drawn
 * in the group's accent hue (« 3 of 6 rounds done » at a glance).
 */
export function GroupAvatar({
  name,
  colorSeed,
  groupId,
  size = 44,
  progress,
}: {
  name: string;
  colorSeed: number | null;
  groupId: string;
  size?: number;
  progress?: { done: number; total: number } | null;
}) {
  const dark = useColorScheme() === 'dark';
  const seed = resolveSeed(colorSeed, groupId);
  const { start, end } = groupAvatarGradient(seed, dark);
  const gid = `disc-${seed}-${(gradientCounter = (gradientCounter + 1) % 1e6)}`;

  const ring = progress && progress.total > 0;
  const stroke = 3;
  const outer = size;
  const discSize = ring ? size - stroke * 2 - 4 : size;
  const r = (outer - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = ring ? Math.min(1, progress.done / progress.total) : 0;

  return (
    <View
      style={{ width: outer, height: outer }}
      className="items-center justify-center"
    >
      {ring ? (
        <Svg
          width={outer}
          height={outer}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={outer / 2}
            cy={outer / 2}
            r={r}
            stroke={dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={outer / 2}
            cy={outer / 2}
            r={r}
            stroke={groupAccent(seed, dark)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            fill="none"
          />
        </Svg>
      ) : null}
      <View
        style={{
          width: discSize,
          height: discSize,
          borderRadius: discSize / 2,
          overflow: 'hidden',
        }}
        className="items-center justify-center"
      >
        <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={start} />
              <Stop offset="1" stopColor={end} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
        <Text
          style={{ fontSize: discSize * 0.36 }}
          className="font-body-semi text-white"
        >
          {groupInitials(name)}
        </Text>
      </View>
    </View>
  );
}
