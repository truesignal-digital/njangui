import { useEffect, useRef, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Platform,
  Text,
  TurboModuleRegistry,
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
import { LanguageToggle } from './language-toggle';

type AuthMode = 'signIn' | 'signUp' | 'signInOrUp';
type NativeAuthViewProps = {
  mode?: AuthMode;
  isDismissable?: boolean;
};

let NativeAuthView: ComponentType<NativeAuthViewProps> | null = null;

if (Platform.OS !== 'web' && TurboModuleRegistry.get('ClerkExpo')) {
  try {
    NativeAuthView = require('@clerk/expo/native').AuthView;
  } catch {
    NativeAuthView = null;
  }
}

/** docs/03 B10: a user whose name is empty (or still just their phone number)
 * hasn't answered « Comment le groupe vous appelle-t-il ? » yet. */
function needsOnboarding(user: { name: string; phone?: string }): boolean {
  const name = user.name.trim();
  return name.length === 0 || (user.phone !== undefined && name === user.phone);
}

/**
 * Phone-first Clerk auth (SMS OTP — configured as the primary identifier in
 * the Clerk dashboard). Follows piol mobile's clerk-auth-screen: native
 * AuthView when the dev client includes the Clerk module, with an inline
 * "native build required" fallback otherwise. Wrapped with the Njangi
 * tagline, FR/EN toggle and the custody-free trust line (docs/03 B10).
 */
export function ClerkAuthScreen({ mode = 'signInOrUp' }: { mode?: AuthMode }) {
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

  if (isSignedIn && !isAuthenticated) {
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

  if (NativeAuthView) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom }}
      >
        <View className="flex-row items-start justify-between gap-sm px-lg pb-sm">
          <View className="min-w-0 flex-1 gap-xs">
            <Text className="font-heading text-headline text-foreground">
              {t('common.appName')}
            </Text>
            <Text className="font-body text-body-sm text-muted">{t('auth.tagline')}</Text>
          </View>
          <LanguageToggle />
        </View>
        <View className="flex-1">
          <NativeAuthView mode={mode} isDismissable={false} />
        </View>
        <Text className="px-lg pb-sm pt-xs text-center font-body text-caption text-placeholder">
          {t('auth.custodyNote')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center bg-background px-xl" testID="clerk-auth-native-required">
      <View
        className="items-center gap-sm rounded-xl border border-border-subtle bg-surface px-xl py-[28px]"
        style={shadow('card')}
      >
        {!isClerkLoaded ? <ActivityIndicator color={theme.accent} size="small" /> : null}
        <Text className="text-center font-body-semi text-title text-foreground">
          {t('auth.nativeBuildRequiredTitle')}
        </Text>
        <Text className="text-center font-body text-body-sm text-muted">
          {t('auth.nativeBuildRequiredBody')}
        </Text>
      </View>
    </View>
  );
}
