import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../lib/convex-api';
import { useAuth } from '../lib/clerk-client';
import { getAppTheme, useShadow } from '../lib/theme';
import { useDeviceLogin } from '../hooks/use-device-login';
import { LanguageToggle } from './language-toggle';
import { OtpAuthForm } from './otp-auth-form';

type AuthMode = 'signIn' | 'signUp' | 'signInOrUp';

/** docs/03 B10: a user whose name is empty (or still just their phone number)
 * hasn't answered « Comment le groupe vous appelle-t-il ? » yet. */
function needsOnboarding(user: { name: string; phone?: string }): boolean {
  const name = user.name.trim();
  return name.length === 0 || (user.phone !== undefined && name === user.phone);
}

/**
 * Auth screen (auth spec): 1) silent device-login first — biometric-gated
 * device secret → Clerk ticket, zero OTP spend; 2) fall back to the
 * WhatsApp OTP form. Clerk stays the session authority throughout (the
 * ticket strategy) — the old Clerk SMS AuthView is gone. Wrapped with the
 * Njangi tagline, FR/EN toggle and the custody-free trust line.
 */
export function ClerkAuthScreen({ mode: _mode = 'signInOrUp' }: { mode?: AuthMode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const shadow = useShadow();
  const colorScheme = useColorScheme();
  const theme = getAppTheme(colorScheme === 'dark' ? 'dark' : 'light');
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const getOrCreateCurrentUser = useMutation(api.users.getOrCreateCurrentUser);
  const syncAttemptedRef = useRef(false);

  // Device-bind re-auth — runs once when signed out; 'failed' reveals the
  // OTP form (one WhatsApp re-enrollment, never a crash).
  const deviceLoginStatus = useDeviceLogin(
    isClerkLoaded === true && isSignedIn === false
  );

  useEffect(() => {
    if (!isSignedIn || isLoading || !isAuthenticated || currentUser === undefined || currentUser)
      return;
    if (currentUser === null) {
      if (syncAttemptedRef.current) return;
      syncAttemptedRef.current = true;
      void getOrCreateCurrentUser().catch(() => {
        syncAttemptedRef.current = false;
      });
    }
  }, [currentUser, getOrCreateCurrentUser, isAuthenticated, isLoading, isSignedIn]);

  if (isSignedIn && isAuthenticated && currentUser) {
    return <Redirect href={needsOnboarding(currentUser) ? '/onboarding' : '/'} />;
  }

  if ((isSignedIn && !isAuthenticated) || deviceLoginStatus === 'trying') {
    return (
      <View className="flex-1 justify-center bg-background px-xl">
        <View
          className="items-center gap-sm rounded-xl border border-border-subtle bg-surface px-xl py-[28px]"
          style={shadow('card')}
        >
          <ActivityIndicator color={theme.accent} size="small" />
          <Text className="text-center font-body-semi text-title text-foreground">
            {t('auth.finishingSignInTitle')}
          </Text>
          <Text className="text-center font-body text-body-sm text-muted">
            {t('auth.finishingSignInBody')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xl,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start justify-between gap-sm px-lg pb-xl">
        <View className="min-w-0 flex-1 gap-xs">
          <Text className="font-heading text-headline text-foreground">
            {t('common.appName')}
          </Text>
          <Text className="font-body text-body-sm text-muted">{t('auth.tagline')}</Text>
        </View>
        <LanguageToggle />
      </View>
      <OtpAuthForm />
      <View className="flex-1" />
      <Text className="px-lg pb-sm pt-xl text-center font-body text-caption text-placeholder">
        {t('auth.custodyNote')}
      </Text>
    </ScrollView>
  );
}
