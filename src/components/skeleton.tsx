import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '../lib/cn';

/**
 * Loading skeleton (docs/03 §D: skeletons match final geometry, never flash
 * the empty state). Size/shape come from the className; the pulse is a
 * Reanimated opacity loop on a plain wrapper so NativeWind never has to
 * style an Animated component.
 */
export function Skeleton({ className }: { className?: string }) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={pulse}>
      <View className={cn('rounded-md bg-surface-muted', className)} />
    </Animated.View>
  );
}
