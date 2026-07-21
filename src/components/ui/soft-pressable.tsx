import type { ReactNode } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { cssInterop } from "nativewind";

import { mobileUiConfig } from "@/lib/mobile-ui-config";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: "style" });

type SoftPressableProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Set false for dense list rows, where native pressed color is calmer. */
  scaleOnPress?: boolean;
};

/** Small, reduced-motion-safe feedback for high-confidence actions. */
export function SoftPressable({
  children,
  disabled,
  onPressIn,
  onPressOut,
  scaleOnPress = true,
  style,
  ...props
}: SoftPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (scaleOnPress && !reducedMotion && !disabled) {
          scale.value = withTiming(mobileUiConfig.motion.pressScale, {
            duration: mobileUiConfig.motion.pressDuration,
          });
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (scaleOnPress && !reducedMotion) {
          scale.value = withTiming(1, {
            duration: mobileUiConfig.motion.pressDuration,
          });
        }
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
