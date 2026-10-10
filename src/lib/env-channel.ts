/*
 * Picks the backend from the EAS Update channel at runtime, so one JS bundle
 * is valid on both channels and the tested preview update can be republished
 * to production unchanged (docs/adr/0001-develop-is-staging.md, invariant 4).
 *
 * Values are public: Convex URLs and Clerk publishable keys ship in every
 * bundle. They mirror the EAS `preview` and `production` environments.
 */

export type BackendEnv = {
  convexUrl: string;
  clerkPublishableKey: string;
};

const CHANNEL_BACKENDS = {
  // Staging: Convex benevolent-gopher-102 + the dev Clerk instance.
  preview: {
    convexUrl: 'https://benevolent-gopher-102.convex.cloud',
    clerkPublishableKey: 'pk_test_aW1tb3J0YWwtY2FsZi01Mi5jbGVyay5hY2NvdW50cy5kZXYk',
  },
  // Prod: Convex fantastic-zebra-245 + clerk.njangui.truesignaldigital.com.
  production: {
    convexUrl: 'https://fantastic-zebra-245.convex.cloud',
    clerkPublishableKey: 'pk_live_Y2xlcmsubmphbmd1aS50cnVlc2lnbmFsZGlnaXRhbC5jb20k',
  },
} as const satisfies Record<string, BackendEnv>;

// Dev-client builds report `null` (or their build channel) and keep the
// EXPO_PUBLIC_* values from .env.local or the EAS environment they were built with.
const BUILD_TIME_CHANNELS = new Set<string | null>([null, 'development']);

function isChannelBackend(channel: string): channel is keyof typeof CHANNEL_BACKENDS {
  return Object.prototype.hasOwnProperty.call(CHANNEL_BACKENDS, channel);
}

export function resolveBackendEnv(
  channel: string | null,
  buildTimeEnv: Partial<BackendEnv>
): BackendEnv {
  if (BUILD_TIME_CHANNELS.has(channel)) {
    const { convexUrl, clerkPublishableKey } = buildTimeEnv;
    if (!convexUrl) throw new Error('Missing EXPO_PUBLIC_CONVEX_URL');
    if (!clerkPublishableKey) throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    return { convexUrl, clerkPublishableKey };
  }

  if (channel !== null && isChannelBackend(channel)) {
    return CHANNEL_BACKENDS[channel];
  }

  throw new Error(`Unknown update channel "${channel}": no backend is mapped to it`);
}
