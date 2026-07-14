import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '@/lib/theme';
import { NjangiMark } from '@/components/brand/njangi-mark';

function SealNode({
  active,
  x,
  y,
}: {
  active: boolean;
  x: number;
  y: number;
}) {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? withTiming(active ? 1 : 0, { duration: 100 })
      : withSpring(active ? 1 : 0, { damping: 16, stiffness: 180 });
  }, [active, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.42 + progress.value * 0.58,
    transform: [{ scale: reducedMotion ? 1 : 0.82 + progress.value * 0.18 }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - 8,
          top: y - 8,
          width: 16,
          height: 16,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: active ? theme.highlight : theme.border,
          backgroundColor: active ? theme.collectiveHero : theme.surface,
        },
        animatedStyle,
      ]}
    />
  );
}

/** The collective identity forming one person at a time. */
export function CircleSeal({
  progress,
  label,
  monogram,
  size = 116,
}: {
  progress: number;
  label: string;
  monogram?: string;
  size?: number;
}) {
  const theme = useAppTheme();
  const total = 5;
  const center = size / 2;
  const radius = size / 2 - 12;
  const initials = (monogram ?? label).trim().slice(0, 2).toUpperCase() || 'N';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignSelf: 'center' }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 9,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.successBg,
        }}
      >
        <NjangiMark size={size - 34} color={theme.successDark} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: center - 20,
          top: center - 20,
          width: 40,
          height: 40,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.successBg,
          borderWidth: 3,
          borderColor: theme.successBg,
        }}
      >
        <Text style={theme.textStyle('caption', theme.successDark)}>{initials}</Text>
      </View>
      {Array.from({ length: total }, (_, index) => {
        const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
        return (
          <SealNode
            key={index}
            active={index < Math.min(progress, total)}
            x={center + Math.cos(angle) * radius}
            y={center + Math.sin(angle) * radius}
          />
        );
      })}
    </View>
  );
}
