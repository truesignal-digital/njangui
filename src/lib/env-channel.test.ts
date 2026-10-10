import { describe, expect, test } from 'bun:test';
import { resolveBackendEnv } from './env-channel';

const STAGING_DEPLOYMENT = 'benevolent-gopher-102';
const PROD_DEPLOYMENT = 'fantastic-zebra-245';

// Build-time values that would be wrong for the channel, to prove the channel wins.
const stagingBuildEnv = {
  convexUrl: `https://${STAGING_DEPLOYMENT}.convex.cloud`,
  clerkPublishableKey: 'pk_test_c3RhZ2luZyQ',
  siteUrl: 'https://staging.njangi.example',
};
const prodBuildEnv = {
  convexUrl: `https://${PROD_DEPLOYMENT}.convex.cloud`,
  clerkPublishableKey: 'pk_live_cHJvZCQ',
  siteUrl: 'https://prod.njangi.example',
};

describe('resolveBackendEnv', () => {
  test('production never resolves to staging or a test Clerk key', () => {
    for (const buildEnv of [stagingBuildEnv, prodBuildEnv, {}]) {
      const env = resolveBackendEnv('production', buildEnv);
      expect(env.convexUrl).not.toContain(STAGING_DEPLOYMENT);
      expect(env.convexUrl).toBe(`https://${PROD_DEPLOYMENT}.convex.cloud`);
      expect(env.clerkPublishableKey.startsWith('pk_test_')).toBe(false);
      expect(env.clerkPublishableKey.startsWith('pk_live_')).toBe(true);
    }
  });

  test('preview never resolves to the prod deployment or a live Clerk key', () => {
    for (const buildEnv of [stagingBuildEnv, prodBuildEnv, {}]) {
      const env = resolveBackendEnv('preview', buildEnv);
      expect(env.convexUrl).not.toContain(PROD_DEPLOYMENT);
      expect(env.convexUrl).toBe(`https://${STAGING_DEPLOYMENT}.convex.cloud`);
      expect(env.clerkPublishableKey.startsWith('pk_live_')).toBe(false);
    }
  });

  test('dev builds (no channel, or the development channel) keep build-time values', () => {
    expect(resolveBackendEnv(null, stagingBuildEnv)).toEqual(stagingBuildEnv);
    expect(resolveBackendEnv('development', stagingBuildEnv)).toEqual(stagingBuildEnv);
  });

  test('channel builds ignore the publish-time site URL', () => {
    for (const channel of ['preview', 'production']) {
      for (const buildEnv of [stagingBuildEnv, prodBuildEnv, {}]) {
        expect(resolveBackendEnv(channel, buildEnv).siteUrl).toBe('https://njangi.app');
      }
    }
  });

  test('dev builds fall back to the default site URL', () => {
    const { siteUrl: _siteUrl, ...withoutSiteUrl } = stagingBuildEnv;
    expect(resolveBackendEnv(null, withoutSiteUrl).siteUrl).toBe('https://njangi.app');
  });

  test('dev builds without build-time values throw', () => {
    expect(() => resolveBackendEnv(null, {})).toThrow('EXPO_PUBLIC_CONVEX_URL');
    expect(() =>
      resolveBackendEnv(null, { convexUrl: stagingBuildEnv.convexUrl })
    ).toThrow('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });

  test('an unknown channel throws instead of guessing a backend', () => {
    expect(() => resolveBackendEnv('staging', prodBuildEnv)).toThrow('Unknown update channel');
    expect(() => resolveBackendEnv('', prodBuildEnv)).toThrow('Unknown update channel');
  });
});
