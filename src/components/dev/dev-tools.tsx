import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { useConvexAuth, useMutation } from 'convex/react';

import { api } from '../../lib/convex-api';

// Clerk dev-instance test phone (reserved 555-01XX block) → fixed OTP, no SMS.
const TEST_PHONE = '+12015550100';
const TEST_CODE = '424242';

/**
 * DEV-only auto sign-in. Bypasses the simulator text-input wall by driving
 * Clerk's JS API with a test number programmatically (one tap). Mount under
 * __DEV__ only. Tries sign-in, falls back to sign-up for a fresh test user.
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const run = async () => {
    if (!signInLoaded || !signUpLoaded || !signIn || !signUp) return;
    setBusy(true);
    setStatus('signing in…');
    try {
      try {
        const attempt = await signIn.create({ identifier: TEST_PHONE });
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
        await signUp.create({ phoneNumber: TEST_PHONE });
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
      setBusy(false);
    }
  };

  return (
    <View className="absolute inset-x-0 bottom-[40px] items-center">
      <Pressable
        testID="dev-signin"
        onPress={() => void run()}
        disabled={busy}
        className="flex-row items-center gap-xs rounded-pill border border-dashed border-accent bg-accent-faint px-lg py-sm"
      >
        {busy ? <ActivityIndicator size="small" color="#b45309" /> : null}
        <Text className="font-body-semi text-body-sm text-accent">
          DEV sign-in (test number)
        </Text>
      </Pressable>
      {status ? (
        <Text className="mt-xs px-lg text-center font-body text-caption text-muted">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * DEV-only floating button: seeds a setup-state group (president + treasurer
 * + members) via api.dev.devSeed and jumps to it, so the cycle-start flow
 * can be driven hands-free. Visible across the authed area under __DEV__.
 */
export function DevSeedButton() {
  const { isAuthenticated } = useConvexAuth();
  const devSeed = useMutation(api.dev.devSeed);
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated) return null;

  const run = async () => {
    setBusy(true);
    try {
      const { groupId } = await devSeed({ memberCount: 4 });
      router.replace({
        pathname: '/groups/[groupId]',
        params: { groupId },
      });
    } catch {
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID="dev-seed"
      onPress={() => void run()}
      disabled={busy}
      className="absolute right-[12px] top-[60px] flex-row items-center gap-xs rounded-pill border border-dashed border-accent bg-accent-faint px-md py-xs"
    >
      {busy ? <ActivityIndicator size="small" color="#b45309" /> : null}
      <Text className="font-body-semi text-caption text-accent">DEV seed</Text>
    </Pressable>
  );
}
