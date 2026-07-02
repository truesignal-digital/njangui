import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import {
  constantTimeEqualHex,
  DEVICE_LOGIN_LOCK_MS,
  DEVICE_LOGIN_MAX_FAILURES,
  DEVICE_STALE_MS,
  MAX_DEVICES_PER_USER,
} from './otp';
import { pushPlatformValidator } from './schema';
import { getCurrentUser } from './utils/auth';

// ============================================================================
// Device credentials (docs/auth-whatsapp-otp-devicebind-spec.md): one row
// binds a possession proof to one handset. Only the salted hash of the
// 256-bit secret is stored; deviceLogin (convex/otp.ts) verifies it
// constant-time and mints a Clerk ticket — zero WhatsApp spend after the
// first verify.
// ============================================================================

/** Called by verifyOtp right after a consumed possession proof. */
export const register = internalMutation({
  args: {
    clerkUserId: v.string(),
    phone: v.string(),
    deviceId: v.string(),
    secretHash: v.string(),
    salt: v.string(),
    platform: pushPlatformValidator,
    label: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkUserId))
      .unique();
    if (!user) {
      // setVerifiedPhone (which precedes this in verifyOtp) creates the row;
      // missing here means a caller ordering bug — refuse rather than bind
      // a credential to nobody.
      throw new Error('User row missing at device registration');
    }
    const now = Date.now();

    // Re-registering the same deviceId = rotate the secret in place.
    const existing = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('deviceId', args.deviceId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: user._id,
        clerkUserId: args.clerkUserId,
        phone: args.phone,
        secretHash: args.secretHash,
        salt: args.salt,
        platform: args.platform,
        ...(args.label !== undefined && { label: args.label }),
        lastSeenAt: now,
        revokedAt: undefined,
        failedAttempts: undefined,
        lockedUntil: undefined,
      });
      return null;
    }

    // Cap devices per user (unbounded = unbounded ticket oracles): evict the
    // stalest live credential when full.
    const mine = await ctx.db
      .query('devices')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const live = mine.filter((d) => d.revokedAt === undefined);
    if (live.length >= MAX_DEVICES_PER_USER) {
      const stalest = live.sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0];
      await ctx.db.patch(stalest._id, { revokedAt: now });
    }

    await ctx.db.insert('devices', {
      userId: user._id,
      clerkUserId: args.clerkUserId,
      phone: args.phone,
      deviceId: args.deviceId,
      secretHash: args.secretHash,
      salt: args.salt,
      platform: args.platform,
      label: args.label,
      createdAt: now,
      lastSeenAt: now,
    });
    return null;
  },
});

/** deviceLogin step 1 — load salt + identity; never returns the hash. */
export const getForLogin = internalQuery({
  args: { deviceId: v.string() },
  returns: v.object({
    ok: v.boolean(),
    clerkUserId: v.optional(v.string()),
    salt: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('deviceId', args.deviceId))
      .unique();
    const now = Date.now();
    if (
      !device ||
      device.revokedAt !== undefined ||
      (device.lockedUntil !== undefined && device.lockedUntil > now) ||
      now - device.lastSeenAt > DEVICE_STALE_MS
    ) {
      return { ok: false };
    }
    return { ok: true, clerkUserId: device.clerkUserId, salt: device.salt };
  },
});

/**
 * deviceLogin step 2 — constant-time hash compare + touch. Failures count
 * toward a lockout (rate limit per deviceId, T-05).
 */
export const verifyAndTouch = internalMutation({
  args: {
    deviceId: v.string(),
    secretHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('deviceId', args.deviceId))
      .unique();
    const now = Date.now();
    if (
      !device ||
      device.revokedAt !== undefined ||
      (device.lockedUntil !== undefined && device.lockedUntil > now)
    ) {
      return false;
    }

    if (!constantTimeEqualHex(device.secretHash, args.secretHash)) {
      const failures = (device.failedAttempts ?? 0) + 1;
      await ctx.db.patch(device._id, {
        failedAttempts: failures,
        ...(failures >= DEVICE_LOGIN_MAX_FAILURES && {
          lockedUntil: now + DEVICE_LOGIN_LOCK_MS,
          failedAttempts: 0,
        }),
      });
      return false;
    }

    await ctx.db.patch(device._id, {
      lastSeenAt: now,
      failedAttempts: undefined,
      lockedUntil: undefined,
    });
    return true;
  },
});

/** SIM-swap / lost-phone blast-radius control (T-04). */
export const revokeAllForPhone = internalMutation({
  args: { phone: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('devices')
      .withIndex('by_phone', (q) => q.eq('phone', args.phone))
      .collect();
    const now = Date.now();
    let revoked = 0;
    for (const device of rows) {
      if (device.revokedAt === undefined) {
        await ctx.db.patch(device._id, { revokedAt: now });
        revoked++;
      }
    }
    return revoked;
  },
});

// ── Authed device management (launch-blocking device-revoke UI backs onto
//    these) ──────────────────────────────────────────────────────────────

const deviceItemValidator = v.object({
  deviceId: v.string(),
  platform: pushPlatformValidator,
  label: v.optional(v.string()),
  createdAt: v.number(),
  lastSeenAt: v.number(),
  revoked: v.boolean(),
});

export const listMyDevices = query({
  args: {},
  returns: v.array(deviceItemValidator),
  handler: async (ctx) => {
    const { user } = await getCurrentUser(ctx);
    const rows = await ctx.db
      .query('devices')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    return rows
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((d) => ({
        deviceId: d.deviceId,
        platform: d.platform,
        label: d.label,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
        revoked: d.revokedAt !== undefined,
      }));
  },
});

export const revokeDevice = mutation({
  args: { deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('deviceId', args.deviceId))
      .unique();
    if (!device || device.userId !== user._id) {
      throw new Error('Device not found');
    }
    if (device.revokedAt === undefined) {
      await ctx.db.patch(device._id, { revokedAt: Date.now() });
    }
    return null;
  },
});
