import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useConvexAuth, useMutation } from 'convex/react';

import { api } from '../lib/convex-api';
import { DEVICE_PLATFORM } from '../lib/env';

/*
 * Allowlist of deep-link path prefixes the app will route from a push tap.
 * Must mirror the builders in convex/lib/appLinks.ts — a URL the backend
 * can send but the client won't route is a silent dead tap.
 */
const PUSH_LINK_PREFIXES = ['/payments/', '/groups/'] as const;

function routePushUrl(url: unknown) {
  if (typeof url !== 'string') return;
  if (!PUSH_LINK_PREFIXES.some((prefix) => url.startsWith(prefix))) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.push(url as any);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Push registration + deep-link handling (05 M12). Best-effort by design:
 * no EAS projectId (local dev build) or no permission → silently skip —
 * the in-app À-confirmer inbox is the guaranteed channel. Notification
 * taps deep-link via `data.url` (e.g. `/payments/<id>`).
 */
export function usePushNotifications() {
  const { isAuthenticated } = useConvexAuth();
  const savePushToken = useMutation(api.users.savePushToken);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const register = async () => {
      try {
        // Permission FIRST, even without an EAS projectId: local dev builds
        // can't mint an Expo push token, but they can still DISPLAY
        // notifications (simulated pushes, future local notifications) and
        // handle deep-link taps — bailing before the permission ask left
        // iOS suppressing every banner in dev.
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== 'granted' || cancelled) return;

        const projectId: string | undefined =
          Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return; // remote token needs EAS — inbox covers it

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Njangi',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }

        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (!cancelled && token) {
          await savePushToken({
            token,
            platform: DEVICE_PLATFORM,
          });
        }
      } catch {
        // best-effort — never block the app on push setup
      }
    };
    void register();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, savePushToken]);

  useEffect(() => {
    /*
     * Cold start: the tap that LAUNCHED the app never reaches the response
     * listener below, so replay the last response once on mount.
     */
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      routePushUrl(response?.notification.request.content.data?.url);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        routePushUrl(response.notification.request.content.data?.url);
      }
    );
    return () => subscription.remove();
  }, []);
}
