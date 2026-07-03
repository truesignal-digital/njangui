import { Platform } from 'react-native';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://njangi.app';

if (!clerkPublishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
}

if (!convexUrl) {
  throw new Error('Missing EXPO_PUBLIC_CONVEX_URL');
}

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
