import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useConvexAuth, useMutation } from 'convex/react';

import { api } from '../lib/convex-api';

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
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
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
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string' && url.startsWith('/')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(url as any);
        }
      }
    );
    return () => subscription.remove();
  }, []);
}
