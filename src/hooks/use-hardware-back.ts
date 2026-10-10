import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Intercepts Android hardware and gesture Back while the screen is focused.
 * `gestureEnabled: false` only blocks the iOS swipe; Android Back bypasses
 * screen options, so a native `hardwareBackPress` listener is the only place
 * to stop it. Registered per focus so a screen pushed on top keeps its own
 * Back. The event never fires on iOS. Return true from `onBack` to consume it.
 */
export function useHardwareBack(onBack: () => boolean) {
  const handlerRef = useRef(onBack);
  useEffect(() => {
    handlerRef.current = onBack;
  });

  useFocusEffect(
    // useCallback: hands a listener to a native event system; a stable effect
    // registers it once per focus instead of on every render.
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => handlerRef.current()
      );
      return () => subscription.remove();
    }, [])
  );
}
