import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';

import { api } from '../lib/convex-api';
import { getOrCreateDeviceId } from '../lib/device-credential';

const PLATFORM_NAMES = { ios: 'iPhone', android: 'Android', web: 'Web' } as const;

/**
 * Connected-devices section (auth spec must-fix #6: the device-revoke UI is
 * launch-blocking). Each row is a live device credential that can mint a
 * session with NO WhatsApp code — the lost/borrowed-phone kill switch a
 * member can operate themselves. The current handset shows a chip instead
 * of a remove button: revoking yourself is what the sign-out button does.
 */
export function DeviceList() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useConvexAuth();
  const devices = useQuery(api.devices.listMyDevices, isAuthenticated ? {} : 'skip');
  const revokeDevice = useMutation(api.devices.revokeDevice);
  const [ownDeviceId, setOwnDeviceId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void getOrCreateDeviceId().then(setOwnDeviceId);
  }, []);

  const live = (devices ?? []).filter((d) => !d.revoked);
  if (live.length === 0) return null;

  const remove = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await revokeDevice({ deviceId });
      toast.success(t('profile.deviceRemoved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View className="gap-sm">
      <View className="gap-[2px]">
        <Text className="font-body-semi text-body text-foreground">
          {t('profile.devicesTitle')}
        </Text>
        <Text className="font-body text-caption text-muted">
          {t('profile.devicesDesc')}
        </Text>
      </View>
      <View className="rounded-xl border border-border-subtle bg-surface">
        {live.map((device, index) => {
          const isSelf = device.deviceId === ownDeviceId;
          const when = new Date(device.lastSeenAt).toLocaleDateString(
            i18n.language === 'fr' ? 'fr-FR' : 'en-GB',
            { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
          );
          return (
            <View
              key={device.deviceId}
              className={
                index > 0
                  ? 'flex-row items-center justify-between gap-sm border-t border-border-faint p-lg'
                  : 'flex-row items-center justify-between gap-sm p-lg'
              }
            >
              <View className="min-w-0 flex-1 gap-[2px]">
                <Text className="font-body-semi text-body-sm text-foreground">
                  {device.label ?? PLATFORM_NAMES[device.platform]}
                </Text>
                <Text className="font-body text-caption text-muted">
                  {t('profile.lastSeen', { date: when })}
                </Text>
              </View>
              {isSelf ? (
                <View className="rounded-pill bg-accent-faint px-md py-xs">
                  <Text className="font-body-semi text-caption text-accent">
                    {t('profile.thisDevice')}
                  </Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  testID={`device-remove-${device.deviceId}`}
                  disabled={busyId !== null}
                  onPress={() => void remove(device.deviceId)}
                  className="flex-row items-center gap-xs py-xs pl-md"
                >
                  {busyId === device.deviceId ? (
                    <ActivityIndicator size="small" />
                  ) : null}
                  <Text className="font-body-semi text-body-sm text-destructive">
                    {t('profile.removeDevice')}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
