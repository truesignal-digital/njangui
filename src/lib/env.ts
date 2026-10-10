import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { resolveBackendEnv } from '@/lib/env-channel';

// The web export (public /g/<shareCode> page) has no update channel; expo-updates
// reports '' there, so web keeps its export-time EXPO_PUBLIC_* values.
const channel = process.env.EXPO_OS === 'web' ? null : Updates.channel;

// Throws at startup on an unknown update channel rather than guessing a backend.
const { clerkPublishableKey, convexUrl, siteUrl } = resolveBackendEnv(channel, {
  // Literal process.env reads so Metro inlines them; only dev builds use them.
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL,
});

/**
 * The 'ios' | 'android' literal backend payloads expect — this app never
 * runs on web, so the coercion lives here once instead of inline ternaries.
 */
export const DEVICE_PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

export const mobileEnv = {
  clerkPublishableKey,
  convexUrl,
  siteUrl,
  appScheme: 'njangi',
} as const;
