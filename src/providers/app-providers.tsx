import { Buffer } from 'buffer';
import { useCallback, useMemo, type PropsWithChildren, type ReactNode } from 'react';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { I18nextProvider } from 'react-i18next';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { mobileEnv } from '../lib/env';
import { i18n } from '../lib/i18n';
import { ClerkProvider, tokenCache, useAuth } from '../lib/clerk-client';
import { useEnsureCurrentUser } from '../hooks/use-ensure-current-user';

const convex = new ConvexReactClient(mobileEnv.convexUrl);
let lastKnownConvexToken: string | null = null;

type ClerkUseAuth = () => {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  getToken: (options: { template?: 'convex'; skipCache?: boolean }) => Promise<string | null>;
  orgId: string | undefined | null;
  orgRole: string | undefined | null;
  sessionClaims: Record<string, unknown> | undefined | null;
};

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const json = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
    return JSON.parse(json) as { aud?: string | string[] | null };
  } catch {
    return null;
  }
}

function tokenTargetsConvex(token: string | null) {
  if (!token) {
    return false;
  }

  const payload = decodeJwtPayload(token);
  const audience = payload?.aud;

  if (Array.isArray(audience)) {
    return audience.includes('convex');
  }

  return audience === 'convex';
}

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function MobileConvexProviderWithClerk({
  children,
  client,
  useAuth,
}: {
  children: ReactNode;
  client: ConvexReactClient;
  useAuth: ClerkUseAuth;
}) {
  const useAuthFromClerk = useUseAuthFromClerk(useAuth);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuthFromClerk}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function useUseAuthFromClerk(useClerkAuth: ClerkUseAuth) {
  return useMemo(
    () =>
      function useAuthFromClerk() {
        const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionClaims } = useClerkAuth();
        const audience = sessionClaims?.aud;
        const audienceKey = Array.isArray(audience)
          ? audience.join(',')
          : typeof audience === 'string'
            ? audience
            : '';

        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
            try {
              const sessionTargetsConvex = Array.isArray(audience)
                ? audience.includes('convex')
                : audience === 'convex';
              const defaultToken = await getToken({
                skipCache: false,
              });
              const defaultTargetsConvex = sessionTargetsConvex || tokenTargetsConvex(defaultToken);

              if (defaultTargetsConvex) {
                lastKnownConvexToken = defaultToken;
                return defaultToken;
              }

              const convexTemplateToken = await withTimeout(
                getToken({
                  template: 'convex',
                  skipCache: false,
                }),
                4000
              );

              if (convexTemplateToken) {
                lastKnownConvexToken = convexTemplateToken;
              }

              return convexTemplateToken;
            } catch (error) {
              if (lastKnownConvexToken) {
                return lastKnownConvexToken;
              }

              return null;
            }
          },
          // Match Convex's official wrapper shape, but also react when audience changes.
          // eslint-disable-next-line react-hooks/exhaustive-deps
          [audienceKey, orgId, orgRole]
        );

        return useMemo(
          () => ({
            isLoading: !isLoaded,
            isAuthenticated: isSignedIn ?? false,
            fetchAccessToken,
          }),
          [fetchAccessToken, isLoaded, isSignedIn]
        );
      },
    [useClerkAuth]
  );
}

function useNativeClerkAuth() {
  return useAuth();
}

function BootstrapUserRecord() {
  useEnsureCurrentUser();
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const clerkProviderProps =
    Platform.OS === 'web'
      ? {
          publishableKey: mobileEnv.clerkPublishableKey,
        }
      : {
          publishableKey: mobileEnv.clerkPublishableKey,
          tokenCache,
        };

  return (
    <ClerkProvider {...clerkProviderProps}>
      <MobileConvexProviderWithClerk client={convex} useAuth={useNativeClerkAuth}>
        <I18nextProvider i18n={i18n}>
          <SafeAreaProvider>
            <BootstrapUserRecord />
            {children}
          </SafeAreaProvider>
        </I18nextProvider>
      </MobileConvexProviderWithClerk>
    </ClerkProvider>
  );
}
