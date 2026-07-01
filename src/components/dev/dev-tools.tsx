import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { useConvexAuth, useMutation } from 'convex/react';

import { api, type Id } from '../../lib/convex-api';
import { useClerk } from '../../lib/clerk-client';

// Clerk dev-instance test phones (reserved 555-01XX block) → fixed OTP, no
// SMS. Slots mirror convex/dev.ts DEV_TEST_PHONES: the seed puts .treasurer
// / .member on real memberships, so signing in as them links those
// memberships by phone — the two-sided handshake is drivable in the sim.
const TEST_CODE = '424242';
const TEST_USERS = [
  { label: 'P', phone: '+12015550100', hint: 'président' },
  { label: 'T', phone: '+12015550101', hint: 'trésorier' },
  { label: 'M', phone: '+12015550102', hint: 'membre' },
] as const;

/**
 * DEV-only auto sign-in. Bypasses the simulator text-input wall by driving
 * Clerk's JS API with a test number programmatically (one tap per identity).
 * Mount under __DEV__ only. Tries sign-in, falls back to sign-up.
 */
export function DevAuthButton() {
  const {
    isLoaded: signInLoaded,
    signIn,
    setActive: setActiveSignIn,
  } = useSignIn();
  const {
    isLoaded: signUpLoaded,
    signUp,
    setActive: setActiveSignUp,
  } = useSignUp();
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (phone: string) => {
    if (!signInLoaded || !signUpLoaded || !signIn || !signUp) return;
    setBusyPhone(phone);
    setStatus('signing in…');
    try {
      try {
        const attempt = await signIn.create({ identifier: phone });
        const factor = (attempt.supportedFirstFactors ?? []).find(
          (f) => f.strategy === 'phone_code'
        ) as { phoneNumberId: string } | undefined;
        if (!factor) throw new Error('no phone factor');
        await signIn.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: factor.phoneNumberId,
        });
        const res = await signIn.attemptFirstFactor({
          strategy: 'phone_code',
          code: TEST_CODE,
        });
        if (res.status === 'complete' && setActiveSignIn) {
          await setActiveSignIn({ session: res.createdSessionId });
          return;
        }
        throw new Error(`sign-in status ${res.status}`);
      } catch {
        // Fresh test user → sign up instead.
        setStatus('signing up…');
        await signUp.create({ phoneNumber: phone });
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
        const res = await signUp.attemptPhoneNumberVerification({
          code: TEST_CODE,
        });
        if (res.status === 'complete' && setActiveSignUp) {
          await setActiveSignUp({ session: res.createdSessionId });
          return;
        }
        throw new Error(`sign-up status ${res.status}`);
      }
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
    } finally {
      setBusy(null);
    }
  };

  const openRound = async () => {
    if (!params.groupId) return;
    setBusy('round');
    try {
      await devStartAndOpenRound({
        groupId: params.groupId as Id<'groups'>,
      });
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
