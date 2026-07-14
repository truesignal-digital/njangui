import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDownIcon, ChevronRightIcon } from 'react-native-heroicons/outline';

import type {
  AttentionSnapshot,
  WaitingFact,
} from '../../lib/attention-presentation';
import {
  presentWaitingFact,
  waitingFactCount,
} from '../../lib/attention-presentation';
import { haptics } from '../../lib/haptics';
import { ICON_SIZE } from '../../lib/icons';
import { mobileUiConfig } from '../../lib/mobile-ui-config';
import { useAppTheme } from '../../lib/theme';
import { SoftPressable } from '../ui/soft-pressable';

type Translate = (
  key: string,
  options?: Record<string, string | number>
) => string;

/** Branded disclosure stays shared RN; native controls are reserved for OS jobs. */
export function WaitingShelf({
  waiting,
  t,
  onOpen,
}: {
  waiting: AttentionSnapshot['waiting'];
  t: Translate;
  onOpen: (waiting: WaitingFact) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (waiting.length === 0) return null;

  const count = waitingFactCount(waiting);
  const toggle = () => {
    haptics.select();
    const next = !isOpen;
    setIsOpen(next);
    if (!reducedMotion) {
      rotation.value = withTiming(next ? 180 : 0, {
        duration: next
          ? mobileUiConfig.motion.enterDuration
          : mobileUiConfig.motion.exitDuration,
      });
    }
  };

  return (
    <View
      className="overflow-hidden rounded-xl bg-surface-muted"
      style={{ borderCurve: 'continuous' }}
    >
      <SoftPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={toggle}
        scaleOnPress={false}
        className="min-h-[38px] flex-row items-center justify-between gap-sm px-sm py-xs active:bg-surface-recessed"
      >
        <Text className="font-body-semi text-body-sm text-foreground">
          {t('attention.waiting.label', { count })}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDownIcon size={ICON_SIZE.metadata} color={theme.textMuted} />
        </Animated.View>
      </SoftPressable>

      {isOpen ? (
        <Animated.View
          entering={FadeInDown.duration(
            reducedMotion
              ? mobileUiConfig.motion.reducedDuration
              : mobileUiConfig.motion.enterDuration
          ).reduceMotion(ReduceMotion.System)}
          exiting={FadeOutUp.duration(
            reducedMotion
              ? mobileUiConfig.motion.reducedDuration
              : mobileUiConfig.motion.exitDuration
          ).reduceMotion(ReduceMotion.System)}
          className="border-t border-border-faint bg-surface px-md"
        >
          {waiting.map((fact, index) => {
            const model = presentWaitingFact(fact, t);
            const canOpen = Boolean(model.openLabel && fact.destination);
            return (
              <SoftPressable
                key={model.id}
                accessibilityRole={canOpen ? 'button' : undefined}
                disabled={!canOpen}
                onPress={() => onOpen(fact)}
                scaleOnPress={false}
                className={`flex-row items-center gap-sm py-md ${
                  index > 0 ? 'border-t border-border-faint' : ''
                }`}
              >
                <View className="min-w-0 flex-1 gap-[2px]">
                  <Text className="font-body-semi text-body-sm text-foreground">
                    {model.title}
                  </Text>
                  <Text className="font-body text-caption text-muted">
                    {model.detail}
                  </Text>
                </View>
                {canOpen ? (
                  <ChevronRightIcon
                    size={ICON_SIZE.metadata}
                    color={theme.textMuted}
                  />
                ) : null}
              </SoftPressable>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}
