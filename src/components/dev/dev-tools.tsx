import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useAction, useConvexAuth, useMutation } from 'convex/react';
import { toast } from 'sonner-native';

import { api, type Id } from '../../lib/convex-api';
import { useClerk, useSignIn } from '../../lib/clerk-client';
import { getOrCreateDeviceId } from '../../lib/device-credential';

// Test phones (555-01XX block). Slots mirror convex/dev.ts DEV_TEST_PHONES:
// the seed puts .treasurer/.member on real memberships, so signing in as
// them links those memberships by phone — the two-sided handshake is
// drivable in the sim.
const TEST_USERS = [
  { label: 'P', phone: '+12015550100', hint: 'président' },
  { label: 'T', phone: '+12015550101', hint: 'trésorier' },
  { label: 'M', phone: '+12015550102', hint: 'membre' },
] as const;

/**
 * DEV-only auto sign-in — rides the REAL WhatsApp-OTP path (must-fix #2:
 * no separate credential): requestOtp with the server-side dev provider
 * (DEV_OTP_PROVIDER=log, throws at load in production) returns the
 * generated code, verifyOtp consumes it through the same machinery, and
 * the session lands via the same Clerk ticket. One tap per identity.
 */
export function DevAuthButton() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const requestOtp = useAction(api.otp.requestOtp);
  const verifyOtp = useAction(api.otp.verifyOtp);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (phone: string) => {
    if (!isLoaded || !signIn) return;
    setBusyPhone(phone);
    setStatus('requesting dev code…');
    try {
      const deviceId = await getOrCreateDeviceId();
      const requested = await requestOtp({
        phone,
        purpose: 'login',
        deviceId,
        language: 'fr',
      });
      if (!requested.ok || !requested.devCode) {
        throw new Error(
          requested.ok
            ? 'no devCode — set DEV_OTP_PROVIDER=log on the deployment'
            : `throttled — retry in ${Math.ceil((requested.retryAfterMs ?? 0) / 1000)}s`
        );
      }
      setStatus('verifying…');
      const verified = await verifyOtp({
        phone,
        code: requested.devCode,
        purpose: 'login',
        deviceId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      if (!verified.ok) {
        throw new Error(`verify failed: ${verified.reason}`);
      }
      const attempt = await signIn.create({
        strategy: 'ticket',
        ticket: verified.ticket,
      });
      if (attempt.status === 'complete' && setActive) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      throw new Error(`ticket sign-in status ${attempt.status}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'dev auth failed');
      setBusyPhone(null);
    }
  };

  return (
    <View className="absolute inset-x-0 bottom-[40px] items-center">
      <View className="flex-row items-center gap-sm">
        {TEST_USERS.map((u) => (
          <Pressable
            key={u.phone}
            testID={`dev-signin-${u.label}`}
            onPress={() => void run(u.phone)}
            disabled={busyPhone !== null}
            className="flex-row items-center gap-xs rounded-pill border border-dashed border-accent bg-accent-faint px-lg py-sm"
          >
            {busyPhone === u.phone ? (
              <ActivityIndicator size="small" color="#b45309" />
            ) : null}
            <Text className="font-body-semi text-body-sm text-accent">
              DEV {u.label} ({u.hint})
            </Text>
          </Pressable>
        ))}
      </View>
      {status ? (
        <Text className="mt-xs px-lg text-center font-body text-caption text-muted">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * DEV-only floating cluster in the authed area: seed a group, start+open a
 * round on the group being viewed, and sign out to switch test identities.
 * Kept top-right, clear of bottom CTAs (audit P1: never overlay form CTAs).
 */
export function DevSeedButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useClerk();
  const params = useGlobalSearchParams<{ groupId?: string }>();
  const devSeed = useMutation(api.dev.devSeed);
  const devStartAndOpenRound = useMutation(api.dev.devStartAndOpenRound);
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (!isAuthenticated) return null;

  const seed = async () => {
    setBusy('seed');
    try {
      const { groupId } = await devSeed({ memberCount: 4 });
      router.replace({
        pathname: '/groups/[groupId]',
        params: { groupId },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'devSeed failed');
    } finally {
      setBusy(null);
    }
  };

  const openRound = async () => {
    if (!params.groupId) return;
    setBusy('round');
    try {
      const result = await devStartAndOpenRound({
        groupId: params.groupId as Id<'groups'>,
      });
      toast.success(`round ${result.opened ? 'opened' : 'already open'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'open round failed');
    } finally {
      setBusy(null);
    }
  };

  const switchUser = async () => {
    setBusy('switch');
    try {
      await signOut();
    } finally {
      setBusy(null);
    }
  };

  if (collapsed) {
    return (
      <Pressable
        testID="dev-expand"
        onPress={() => setCollapsed(false)}
        className="absolute right-[12px] top-[60px] rounded-pill border border-dashed border-accent bg-accent-faint px-md py-xs"
      >
        <Text className="font-body-semi text-caption text-accent">DEV</Text>
      </Pressable>
    );
  }

  const pill =
    'flex-row items-center gap-xs rounded-pill border border-dashed border-accent bg-accent-faint px-md py-xs';

  return (
    <View className="absolute right-[12px] top-[60px] items-end gap-xs">
      <Pressable testID="dev-seed" onPress={() => void seed()} disabled={busy !== null} className={pill}>
        {busy === 'seed' ? <ActivityIndicator size="small" color="#b45309" /> : null}
        <Text className="font-body-semi text-caption text-accent">DEV seed</Text>
      </Pressable>
      {params.groupId ? (
        <Pressable
          testID="dev-open-round"
          onPress={() => void openRound()}
          disabled={busy !== null}
          className={pill}
        >
          {busy === 'round' ? <ActivityIndicator size="small" color="#b45309" /> : null}
          <Text className="font-body-semi text-caption text-accent">DEV open round</Text>
        </Pressable>
      ) : null}
      <Pressable
        testID="dev-switch-user"
        onPress={() => void switchUser()}
        disabled={busy !== null}
        className={pill}
      >
        {busy === 'switch' ? <ActivityIndicator size="small" color="#b45309" /> : null}
        <Text className="font-body-semi text-caption text-accent">DEV switch user</Text>
      </Pressable>
      <Pressable testID="dev-collapse" onPress={() => setCollapsed(true)} className={pill}>
        <Text className="font-body-semi text-caption text-accent">×</Text>
      </Pressable>
    </View>
  );
}
