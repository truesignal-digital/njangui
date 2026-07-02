import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  action,
  type ActionCtx,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { isValidE164, normalizePhone } from './utils/phone';

// ============================================================================
// WhatsApp OTP auth (docs/auth-whatsapp-otp-devicebind-spec.md).
//
// Flow: requestOtp (public action) → Twilio Verify sends the WhatsApp code
// (SMS fallback) → verifyOtp checks it, resolves/creates the Clerk user by
// phone, mints a SHORT-TTL Clerk sign-in ticket, sets the verified phone
// through the linkGuard chokepoint, and (optionally) registers a device
// credential so later logins skip the OTP entirely (deviceLogin).
//
// These run BEFORE any session exists → public unauthenticated actions;
// all state I/O goes through internal mutations. Crypto via Web Crypto —
// default Convex runtime, no "use node".
// ============================================================================

// ── Constants (02-style single source) ──────────────────────────────────
const OTP_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const DAILY_SEND_CAP_PER_PHONE = 8;
const DAILY_SEND_CAP_PER_DEVICE = 10;
const GLOBAL_DAILY_SEND_BUDGET = 200; // T-07 circuit-breaker; env override below
const TICKET_TTL_SECONDS = 120; // never Clerk's 30-day default (T-05)
const DEVICE_STALE_MS = 180 * 24 * 60 * 60_000; // unused devices expire
const DEVICE_LOGIN_MAX_FAILURES = 5;
const DEVICE_LOGIN_LOCK_MS = 15 * 60_000;
const MAX_DEVICES_PER_USER = 5;

const purposeValidator = v.union(
  v.literal('login'),
  v.literal('device_register'),
  v.literal('phone_change')
);

// ── Dev provider guard (must-fix #2) ────────────────────────────────────
// The dev provider generates the code locally and RETURNS it to the client
// (hands-free sim testing) — a fixed-credential backdoor by construction if
// it ever reached production. Double env gate with a LOAD-TIME throw:
// enabling DEV_OTP_PROVIDER on any deployment not explicitly marked
// DEPLOYMENT_TIER=dev fails the push itself. (NODE_ENV is unusable here —
// Convex module analysis always runs with NODE_ENV=production.) The prod
// deployment must never define either variable. There is no magic code and
// no bypass: the dev code rides the exact same verify path.
const DEV_OTP_ENABLED = process.env.DEV_OTP_PROVIDER === 'log';
if (DEV_OTP_ENABLED && process.env.DEPLOYMENT_TIER !== 'dev') {
  throw new Error(
    'DEV_OTP_PROVIDER requires DEPLOYMENT_TIER=dev — never enable in production'
  );
}

// ── Web Crypto helpers ──────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomDigits(count: number): string {
  // CSPRNG only — the design lint bans the insecure RNG in this file.
  // Rejection-sample to keep the distribution uniform.
  const digits: string[] = [];
  while (digits.length < count) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < 250 && digits.length < count) {
        digits.push(String(byte % 10));
      }
    }
  }
  return digits.join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time compare over FIXED-LENGTH hex digests (never raw strings). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false; // digests are fixed-length; a mismatch here is a code bug
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ── Twilio Verify (provider owns the code) ──────────────────────────────

function twilioAuthHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio env not configured');
  }
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

async function twilioStartVerification(
  phone: string,
  channel: 'whatsapp' | 'sms',
  locale: 'fr' | 'en'
): Promise<{ ok: boolean; sid?: string; status?: number }> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: channel, Locale: locale }),
    }
  );
  if (!response.ok) {
    console.error(
      `Twilio verification start failed (${channel}): ${response.status}`
    );
    return { ok: false, status: response.status };
  }
  const data = (await response.json()) as { sid: string };
  return { ok: true, sid: data.sid };
}

async function twilioCheckVerification(
  phone: string,
  code: string
): Promise<boolean> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    }
  );
  if (!response.ok) {
    return false; // 404 = expired/not-found; anything else = not approved
  }
  const data = (await response.json()) as { status: string };
  return data.status === 'approved';
}

// ── Clerk Backend API (session authority stays Clerk) ───────────────────

function clerkHeaders(): Record<string, string> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error('CLERK_SECRET_KEY not configured in Convex env');
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function clerkResolveUserByPhone(phone: string): Promise<string | null> {
  const response = await fetch(
    `https://api.clerk.com/v1/users?phone_number=${encodeURIComponent(phone)}`,
    { headers: clerkHeaders() }
  );
  if (!response.ok) {
    throw new Error(`Clerk user lookup failed: ${response.status}`);
  }
  const users = (await response.json()) as { id: string }[];
  return users[0]?.id ?? null;
}

async function clerkResolveUserByUsername(
  username: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.clerk.com/v1/users?username=${encodeURIComponent(username)}`,
    { headers: clerkHeaders() }
  );
  if (!response.ok) {
    throw new Error(`Clerk username lookup failed: ${response.status}`);
  }
  const users = (await response.json()) as { id: string }[];
  return users[0]?.id ?? null;
}

/**
 * Clerk REJECTS Cameroonian phone identifiers outright
 * (`unsupported_country_code`, alpha2 CM) — the primary market cannot exist
 * in Clerk as phone users. So the phone identifier NEVER goes to Clerk:
 * new users are created with a deterministic synthetic username derived
 * from the E.164 phone, Convex users.phone (linkGuard) is the phone
 * authority, and Clerk only issues sessions. The deterministic username
 * also makes a half-failed signup retryable — a second create 422s
 * (username taken) and resolves to the same user.
 *
 * ⚠️ Requires Clerk dashboard config: username identifier ENABLED, phone
 * identifier disabled/optional — else create 422s `form_data_missing`.
 * The password is a discarded 256-bit random: with phone off, password is
 * the instance's only auth factor and Clerk refuses
 * `skip_password_requirement`, but sessions here only ever come from
 * sign-in tickets — nobody holds this credential.
 */
async function clerkCreateUserForPhone(phone: string): Promise<string> {
  const username = `phone_${phone.replace('+', '')}`;
  const response = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: clerkHeaders(),
    body: JSON.stringify({
      username,
      password: randomHex(32),
    }),
  });
  if (response.status === 422) {
    // Username already taken = an earlier verify created the Clerk user but
    // died before the ticket — resolve to that same identity.
    const existing = await clerkResolveUserByUsername(username);
    if (existing) return existing;
    const body = await response.text();
    const code = /"code":"([^"]+)"/.exec(body)?.[1] ?? 'unknown';
    throw new Error(
      `Clerk user create 422 (${code}) — check instance identifier config (username enabled, phone optional)`
    );
  }
  if (!response.ok) {
    const body = await response.text();
    const code = /"code":"([^"]+)"/.exec(body)?.[1] ?? 'unknown';
    throw new Error(`Clerk user create failed: ${response.status} (${code})`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

async function clerkMintTicket(clerkUserId: string): Promise<string> {
  const response = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders(),
    body: JSON.stringify({
      user_id: clerkUserId,
      expires_in_seconds: TICKET_TTL_SECONDS, // single-use, short-TTL (T-05)
    }),
  });
  if (!response.ok) {
    throw new Error(`Clerk sign-in token mint failed: ${response.status}`);
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}

// ============================================================================
// Internal mutations — all otpChallenges/devices state I/O
// ============================================================================

export const reserveChallenge = internalMutation({
  args: {
    phone: v.string(),
    purpose: purposeValidator,
    provider: v.union(v.literal('twilio'), v.literal('dev')),
    requestDeviceId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      challengeId: v.id('otpChallenges'),
    }),
    v.object({
      ok: v.literal(false),
      retryAfterMs: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const now = Date.now();

    // T-07 global daily budget circuit-breaker (per-IP is unreliable behind
    // Cameroonian CGNAT; the global cap is the hard backstop).
    const budgetKey = `otp-send-${utcDay(now)}`;
    const budget =
      Number(process.env.OTP_GLOBAL_DAILY_BUDGET) || GLOBAL_DAILY_SEND_BUDGET;
    const counter = await ctx.db
      .query('dailyCounters')
      .withIndex('by_key', (q) => q.eq('key', budgetKey))
      .unique();
    if ((counter?.count ?? 0) >= budget) {
      console.error('OTP global daily send budget exhausted — circuit open');
      return { ok: false as const, retryAfterMs: 60 * 60_000 };
    }

    // Per-device soft cap (client-supplied id — spoofable, still useful).
    // Daily SEND caps are provider-cost protections — the dev provider
    // sends nothing, and one sim device burns 10 real-path logins fast, so
    // they don't apply to it (cooldown/attempts/verify caps all still do).
    if (args.requestDeviceId && args.provider !== 'dev') {
      const deviceKey = `otp-device-${args.requestDeviceId}-${utcDay(now)}`;
      const deviceCounter = await ctx.db
        .query('dailyCounters')
        .withIndex('by_key', (q) => q.eq('key', deviceKey))
        .unique();
      if ((deviceCounter?.count ?? 0) >= DAILY_SEND_CAP_PER_DEVICE) {
        return { ok: false as const, retryAfterMs: 60 * 60_000 };
      }
      if (deviceCounter) {
        await ctx.db.patch(deviceCounter._id, {
          count: deviceCounter.count + 1,
        });
      } else {
        await ctx.db.insert('dailyCounters', { key: deviceKey, count: 1 });
      }
    }

    // ONE active challenge per (phone, purpose) — kills parallel guessing.
    const existing = await ctx.db
      .query('otpChallenges')
      .withIndex('by_phone_and_purpose', (q) =>
        q.eq('phone', args.phone).eq('purpose', args.purpose)
      )
      .collect();
    const active = existing.find((c) => c.consumedAt === undefined);

    if (active) {
      const sinceLastSend = now - active.lastSentAt;
      if (sinceLastSend < RESEND_COOLDOWN_MS) {
        return {
          ok: false as const,
          retryAfterMs: RESEND_COOLDOWN_MS - sinceLastSend,
        };
      }
      const sameDay = utcDay(active.lastSentAt) === utcDay(now);
      const sendCount = sameDay ? active.sendCount : 0;
      if (sendCount >= DAILY_SEND_CAP_PER_PHONE && args.provider !== 'dev') {
        return { ok: false as const, retryAfterMs: 60 * 60_000 };
      }
      // Resend = ROTATE: fresh attempts, fresh expiry; the dev-provider code
      // is re-attached by the action (a resent code always replaces the old).
      await ctx.db.patch(active._id, {
        provider: args.provider,
        codeHash: undefined,
        salt: undefined,
        providerRef: undefined,
        attemptsRemaining: MAX_ATTEMPTS,
        sendCount: sendCount + 1,
        lastSentAt: now,
        expiresAt: now + OTP_TTL_MS,
        requestDeviceId: args.requestDeviceId,
      });
      await bumpGlobalCounter(ctx, budgetKey);
      return { ok: true as const, challengeId: active._id };
    }

    const challengeId = await ctx.db.insert('otpChallenges', {
      phone: args.phone,
      purpose: args.purpose,
      provider: args.provider,
      attemptsRemaining: MAX_ATTEMPTS,
      sendCount: 1,
      lastSentAt: now,
      expiresAt: now + OTP_TTL_MS,
      requestDeviceId: args.requestDeviceId,
    });
    await bumpGlobalCounter(ctx, budgetKey);
    return { ok: true as const, challengeId };
  },
});

async function bumpGlobalCounter(
  ctx: MutationCtx,
  key: string
): Promise<void> {
  const counter = await ctx.db
    .query('dailyCounters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (counter) {
    await ctx.db.patch(counter._id, { count: counter.count + 1 });
  } else {
    await ctx.db.insert('dailyCounters', { key, count: 1 });
  }
}

export const attachSendResult = internalMutation({
  args: {
    challengeId: v.id('otpChallenges'),
    codeHash: v.optional(v.string()),
    salt: v.optional(v.string()),
    providerRef: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.challengeId, {
      ...(args.codeHash !== undefined && { codeHash: args.codeHash }),
      ...(args.salt !== undefined && { salt: args.salt }),
      ...(args.providerRef !== undefined && { providerRef: args.providerRef }),
    });
    return null;
  },
});

/**
 * Send failed → refund the send count so a forced provider failure can't
 * exhaust the daily cap, but the 60s cooldown STANDS (lastSentAt untouched)
 * so failures can't be used to hammer the provider.
 */
export const rollbackSend = internalMutation({
  args: { challengeId: v.id('otpChallenges') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (challenge && challenge.sendCount > 0) {
      await ctx.db.patch(args.challengeId, {
        sendCount: challenge.sendCount - 1,
      });
    }
    return null;
  },
});

export const getChallenge = internalQuery({
  args: { phone: v.string(), purpose: purposeValidator },
  returns: v.union(
    v.null(),
    v.object({
      challengeId: v.id('otpChallenges'),
      provider: v.union(v.literal('twilio'), v.literal('dev')),
      expiresAt: v.number(),
      attemptsRemaining: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('otpChallenges')
      .withIndex('by_phone_and_purpose', (q) =>
        q.eq('phone', args.phone).eq('purpose', args.purpose)
      )
      .collect();
    const active = rows.find((c) => c.consumedAt === undefined);
    if (!active) return null;
    return {
      challengeId: active._id,
      provider: active.provider,
      expiresAt: active.expiresAt,
      attemptsRemaining: active.attemptsRemaining,
    };
  },
});

/**
 * Atomic check-decrement-burn (must-fix #3). For the dev provider the hash
 * compare happens HERE, in one transaction; for Twilio the action already
 * holds the provider verdict and this records consumption + attempt
 * bookkeeping (the global verify cap applies to both).
 */
export const consumeChallenge = internalMutation({
  args: {
    challengeId: v.id('otpChallenges'),
    code: v.optional(v.string()), // dev provider — compared in-transaction
    providerApproved: v.optional(v.boolean()), // twilio verdict
  },
  returns: v.union(v.literal('consumed'), v.literal('rejected'), v.literal('burned')),
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    const now = Date.now();
    if (
      !challenge ||
      challenge.consumedAt !== undefined ||
      challenge.expiresAt < now ||
      challenge.attemptsRemaining <= 0
    ) {
      return 'burned';
    }

    let approved = false;
    if (challenge.provider === 'dev') {
      if (challenge.codeHash && challenge.salt && args.code) {
        const hash = await sha256Hex(`${challenge.salt}${args.code.trim()}`);
        approved = constantTimeEqualHex(hash, challenge.codeHash);
      }
    } else {
      approved = args.providerApproved === true;
    }

    if (!approved) {
      const remaining = challenge.attemptsRemaining - 1;
      await ctx.db.patch(challenge._id, { attemptsRemaining: remaining });
      return remaining <= 0 ? 'burned' : 'rejected';
    }

    await ctx.db.patch(challenge._id, { consumedAt: now });
    return 'consumed';
  },
});

/** Cron sweep — hashes must not linger past their usefulness. */
export const sweepExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60_000; // 1h past expiry / consumption
    const expired = await ctx.db
      .query('otpChallenges')
      .withIndex('by_expires_at', (q) => q.lt('expiresAt', cutoff))
      .take(200);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

// ============================================================================
// Public actions
// ============================================================================

const requestOtpResultValidator = v.object({
  ok: v.boolean(),
  retryAfterMs: v.optional(v.number()),
  /** Dev provider ONLY (env-gated, load-time prod guard) — hands-free sim runs. */
  devCode: v.optional(v.string()),
});

/**
 * Ask for a code. Anti-enumeration (T-08): the response NEVER reveals
 * whether the phone belongs to a known account — no user lookup happens
 * here at all; language comes from the client, never a server lookup.
 */
export const requestOtp = action({
  args: {
    phone: v.string(),
    purpose: purposeValidator,
    deviceId: v.optional(v.string()),
    language: v.union(v.literal('fr'), v.literal('en')),
    channel: v.optional(v.union(v.literal('whatsapp'), v.literal('sms'))),
  },
  returns: requestOtpResultValidator,
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!isValidE164(phone)) {
      return { ok: false, retryAfterMs: 0 };
    }
    const provider = DEV_OTP_ENABLED ? ('dev' as const) : ('twilio' as const);

    const reserved: any = await ctx.runMutation(internal.otp.reserveChallenge, {
      phone,
      purpose: args.purpose,
      provider,
      requestDeviceId: args.deviceId,
    });
    if (!reserved.ok) {
      return { ok: false, retryAfterMs: reserved.retryAfterMs };
    }

    if (provider === 'dev') {
      const code = randomDigits(6);
      const salt = randomHex(16);
      const codeHash = await sha256Hex(`${salt}${code}`);
      await ctx.runMutation(internal.otp.attachSendResult, {
        challengeId: reserved.challengeId,
        codeHash,
        salt,
      });
      // Never log the code in shared logs beyond dev; keyed off challengeId.
      console.log(`[dev-otp] challenge ${reserved.challengeId} code ${code}`);
      return { ok: true, devCode: code };
    }

    // WhatsApp first; explicit SMS when the client asks (fallback ladder).
    const channel = args.channel ?? 'whatsapp';
    let sent = await twilioStartVerification(phone, channel, args.language);
    if (!sent.ok && channel === 'whatsapp') {
      sent = await twilioStartVerification(phone, 'sms', args.language);
    }
    if (!sent.ok) {
      await ctx.runMutation(internal.otp.rollbackSend, {
        challengeId: reserved.challengeId,
      });
      return { ok: false, retryAfterMs: RESEND_COOLDOWN_MS };
    }
    await ctx.runMutation(internal.otp.attachSendResult, {
      challengeId: reserved.challengeId,
      providerRef: sent.sid,
    });
    return { ok: true };
  },
});

// Flat shape (no discriminated union — the app tsconfig is non-strict and
// would not narrow it): ok=true ⇒ linked; ok=false ⇒ reason present.
const linkPhoneResultValidator = v.object({
  ok: v.boolean(),
  deviceSecret: v.optional(v.string()), // returned ONCE; client stores in secure-store
  reason: v.optional(
    v.union(
      v.literal('invalid_code'),
      v.literal('expired'),
      v.literal('collision'),
      v.literal('phone_change'),
      v.literal('not_authenticated')
    )
  ),
});

/**
 * Attach a possession-verified phone to the SIGNED-IN account (auth is
 * username+password; the phone is optional and this is the only way it
 * gets set). Sole trigger of setVerifiedPhone — the linkGuard chokepoint
 * that fires linkMembershipsByPhone. The identity comes from the session
 * JWT, never from an argument. Also registers the device credential so
 * phone-verified users get silent device re-auth.
 */
export const linkPhone = action({
  args: {
    phone: v.string(),
    code: v.string(),
    deviceId: v.optional(v.string()),
    deviceLabel: v.optional(v.string()),
    platform: v.optional(
      v.union(v.literal('ios'), v.literal('android'), v.literal('web'))
    ),
  },
  returns: linkPhoneResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: boolean;
    deviceSecret?: string;
    reason?:
      | 'invalid_code'
      | 'expired'
      | 'collision'
      | 'phone_change'
      | 'not_authenticated';
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ok: false, reason: 'not_authenticated' as const };
    }
    const clerkUserId = identity.subject;

    const phone = normalizePhone(args.phone);
    const code = args.code.trim();
    if (!isValidE164(phone) || !/^\d{4,10}$/.test(code)) {
      return { ok: false, reason: 'invalid_code' as const };
    }

    const challenge: any = await ctx.runQuery(internal.otp.getChallenge, {
      phone,
      purpose: 'login',
    });
    if (!challenge || challenge.expiresAt < Date.now()) {
      return { ok: false, reason: 'expired' as const };
    }

    let providerApproved: boolean | undefined;
    if (challenge.provider === 'twilio') {
      providerApproved = await twilioCheckVerification(phone, code);
    }

    const verdict: 'consumed' | 'rejected' | 'burned' = await ctx.runMutation(
      internal.otp.consumeChallenge,
      {
        challengeId: challenge.challengeId,
        code,
        providerApproved,
      }
    );
    if (verdict !== 'consumed') {
      return {
        ok: false,
        reason: verdict === 'burned' ? ('expired' as const) : ('invalid_code' as const),
      };
    }

    // linkGuard chokepoint — the ONLY path that sets users.phone / links.
    const linked: any = await ctx.runMutation(internal.users.setVerifiedPhone, {
      clerkId: clerkUserId,
      phone,
    });
    if (!linked.ok) {
      return { ok: false, reason: linked.reason };
    }

    // Device-bind: mint a 256-bit bearer secret, store only its salted
    // hash; the raw secret goes back EXACTLY ONCE. Gives phone-verified
    // users silent re-auth when the Clerk session lapses.
    let deviceSecret: string | undefined;
    if (args.deviceId && args.platform) {
      deviceSecret = randomHex(32);
      const salt = randomHex(16);
      const secretHash = await sha256Hex(`${salt}${deviceSecret}`);
      const _registered: null = await ctx.runMutation(internal.devices.register, {
        clerkUserId,
        phone,
        deviceId: args.deviceId,
        secretHash,
        salt,
        platform: args.platform,
        label: args.deviceLabel,
      });
      void _registered;
    }

    return { ok: true, deviceSecret };
  },
});

const deviceLoginResultValidator = v.object({
  ok: v.boolean(),
  ticket: v.optional(v.string()),
});

/**
 * Biometric-gated re-auth: possession of the OS-protected device secret →
 * fresh Clerk ticket. NO WhatsApp message — this is the whole point.
 * Re-asserts the EXISTING identity only: never sets/changes users.phone,
 * never links memberships. Stays a Convex action, never an http.ts route
 * (T-10 — http.ts holds only the svix webhook + /health).
 */
export const deviceLogin = action({
  args: {
    deviceId: v.string(),
    deviceSecret: v.string(),
  },
  returns: deviceLoginResultValidator,
  handler: async (ctx, args) => {
    const verdict: { ok: boolean; clerkUserId?: string; salt?: string } =
      await ctx.runQuery(internal.devices.getForLogin, {
        deviceId: args.deviceId,
      });
    if (!verdict.ok || !verdict.clerkUserId || !verdict.salt) {
      return { ok: false };
    }
    const hash = await sha256Hex(`${verdict.salt}${args.deviceSecret}`);
    const touched: boolean = await ctx.runMutation(
      internal.devices.verifyAndTouch,
      { deviceId: args.deviceId, secretHash: hash }
    );
    if (!touched) {
      return { ok: false };
    }
    const ticket = await clerkMintTicket(verdict.clerkUserId);
    return { ok: true, ticket };
  },
});

/**
 * Dev-harness only (convex/dev.ts devLoginTicket): one-tap identity switch
 * for the sim pills now that user-facing login is username+password. Runs
 * the REAL machinery end-to-end with a server-generated code — reserve →
 * consume → setVerifiedPhone (fresh possession proof, so linkGuard fires
 * exactly like production) → short-TTL ticket. Refuses unless the
 * dev provider is enabled (double env gate + load-time prod throw above).
 */
export async function devTicketForPhone(
  ctx: ActionCtx,
  rawPhone: string
): Promise<{ ok: boolean; ticket?: string; retryAfterMs?: number }> {
  if (!DEV_OTP_ENABLED) {
    throw new Error('devTicketForPhone requires the dev OTP provider');
  }
  const phone = normalizePhone(rawPhone);
  if (!isValidE164(phone)) {
    throw new Error('Invalid phone');
  }

  const reserved: any = await ctx.runMutation(internal.otp.reserveChallenge, {
    phone,
    purpose: 'login',
    provider: 'dev',
  });
  if (!reserved.ok) {
    return { ok: false, retryAfterMs: reserved.retryAfterMs };
  }
  const code = randomDigits(6);
  const salt = randomHex(16);
  const codeHash = await sha256Hex(`${salt}${code}`);
  await ctx.runMutation(internal.otp.attachSendResult, {
    challengeId: reserved.challengeId,
    codeHash,
    salt,
  });
  const verdict: 'consumed' | 'rejected' | 'burned' = await ctx.runMutation(
    internal.otp.consumeChallenge,
    { challengeId: reserved.challengeId, code }
  );
  if (verdict !== 'consumed') {
    throw new Error(`dev ticket challenge not consumable: ${verdict}`);
  }

  let clerkUserId: string | null = await ctx.runQuery(
    internal.users.getClerkIdByPhone,
    { phone }
  );
  if (!clerkUserId) {
    clerkUserId = await clerkResolveUserByPhone(phone);
  }
  if (!clerkUserId) {
    clerkUserId = await clerkCreateUserForPhone(phone);
  }

  const linked: any = await ctx.runMutation(internal.users.setVerifiedPhone, {
    clerkId: clerkUserId,
    phone,
  });
  if (!linked.ok) {
    throw new Error(`dev ticket link refused: ${linked.reason}`);
  }

  const ticket = await clerkMintTicket(clerkUserId);
  return { ok: true, ticket };
}

export {
  MAX_DEVICES_PER_USER,
  DEVICE_STALE_MS,
  DEVICE_LOGIN_MAX_FAILURES,
  DEVICE_LOGIN_LOCK_MS,
  constantTimeEqualHex,
};
