const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://njangi.app';

if (!clerkPublishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
}

if (!convexUrl) {
  throw new Error('Missing EXPO_PUBLIC_CONVEX_URL');
}

export const mobileEnv = {
  clerkPublishableKey,
  convexUrl,
  siteUrl,
  appScheme: 'njangi',
} as const;
