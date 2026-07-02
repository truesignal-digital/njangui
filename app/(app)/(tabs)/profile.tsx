import { useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../src/lib/convex-api';
import { useAuth, useClerk } from '../../../src/lib/clerk-client';
import {
  clearDeviceSecret,
  getOrCreateDeviceId,
} from '../../../src/lib/device-credential';
import { useAppTheme } from '../../../src/lib/theme';
import { AppButton } from '../../../src/components/ui/button';
import { DeviceList } from '../../../src/components/device-list';
import { LanguageToggle } from '../../../src/components/language-toggle';
import { Skeleton } from '../../../src/components/skeleton';

/**
 * Profil tab — minimal (Slice 3 stub; the fuller profile is roadmap #13):
 * who am I, language toggle, sign out, and the custody line the product
 * leads with everywhere.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useClerk();
  const me = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const revokeDevice = useMutation(api.devices.revokeDevice);
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      // Kill this device's credential — server row first (while still
      // authed), then the local secret — or the silent device-login on the
      // auth screen signs the user straight back in and sign-out is a no-op.
      try {
        const deviceId = await getOrCreateDeviceId();
        await revokeDevice({ deviceId });
      } catch {
        // Never device-bound (or offline) — the local burn below still
        // forces a WhatsApp code on the next open.
      }
      await clearDeviceSecret();
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View
      className="flex-1 bg-background px-lg"
      style={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xl,
      }}
    >
      <Text className="font-heading text-display-lg text-foreground">
        {t('tabs.profile')}
      </Text>

      <View className="mt-lg gap-lg">
        {me === undefined ? (
          <Skeleton className="h-[56px] rounded-xl" />
        ) : me ? (
          <View className="gap-[2px] rounded-xl border border-border-subtle bg-surface p-lg">
            <Text className="font-body-semi text-title text-foreground">
              {me.name || '—'}
            </Text>
            {me.phone ? (
              <Text className="font-body text-body-sm text-muted">
                {me.phone}
              </Text>
            ) : null}
          </View>
        ) : null}

        <LanguageToggle />

        <DeviceList />

        <AppButton
          variant="outline"
          label={t('profile.signOut')}
          loading={busy}
          disabled={busy}
          testID="sign-out"
          onPress={() => void handleSignOut()}
        />

        <Text className="text-center font-body text-caption text-placeholder">
          {t('auth.custodyNote')}
        </Text>
      </View>
    </View>
  );
}
