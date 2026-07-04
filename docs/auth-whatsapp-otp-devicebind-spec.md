# Auth redesign — WhatsApp OTP + device-bind

**Status:** proposal / spec · **Date:** 2026-06-15 · **Supersedes:** Clerk SMS OTP (05 Week 1)

## Why

SMS OTP via Clerk (Twilio) is the current first factor. Cameroon A2P SMS runs
**~$0.08–0.35 / message** (MTN ~$0.31, Orange ~$0.35 on metered routes) — too
expensive at the per-login frequency a savings app needs. WhatsApp
authentication-template messages to Cameroon ("Rest of Africa" rate card) run
**~$0.004 / message** — roughly **20–80× cheaper** — and WhatsApp penetration in
Cameroon is high. No email, no Gmail. Phone stays the identity anchor (it is also
the member's MoMo/OM identity and the key `linkMembershipsByPhone` joins on).

Two design moves:

1. **Move OTP _delivery_ off SMS onto WhatsApp** (with SMS/voice fallback). Clerk
   stays the session/identity authority — we don't rip out the `clerkId` model,
   the svix webhook, or `ConvexProviderWithClerk`.
2. **Device-bind** so the OTP is paid **once per device**, not once per login.
   After the first WhatsApp verify on a handset, daily re-auth is a biometric-gated
   device secret → fresh Clerk session, zero OTP spend.

## Core mechanism — backend-verified OTP → Clerk session

The trick that lets us own delivery while Clerk owns the session is the **Clerk
Backend API "sign-in token" + client `ticket` strategy**:

1. Our Convex action (holds `CLERK_SECRET_KEY`) verifies the WhatsApp OTP itself.
2. It resolves the Clerk user from the phone (existing) or creates one (new).
3. It calls `POST https://api.clerk.com/v1/sign_in_tokens` `{ user_id, expires_in_seconds }`
   → single-use, short-TTL JWT (the "ticket").
4. The action returns **only** that ticket to the Expo client.
5. Client: `const r = await signIn.create({ strategy: 'ticket', ticket })` →
   `r.status === 'complete'`, then `setActive({ session: r.createdSessionId })`.
   Clerk requests **no first/second factor**, so Clerk sends **no SMS/email**.
6. `ConvexProviderWithClerk` picks up the session JWT; `getCurrentUser` resolves by
   `clerkId = identity.subject` exactly as today.

> ⚠️ **Use `signIn.create({strategy:'ticket'})` + `setActive`**, NOT the Core-3
> `signIn.ticket()`/`finalize()` — the latter is bugged for sign-in tokens
> ([clerk/javascript#8219](https://github.com/clerk/javascript/issues/8219), stalls
> at `needs_identifier`). Verify against the installed `@clerk/expo ^3.0.1` before
> building; it exposes the working `create`/`setActive` path.

Verified Clerk endpoints (all `confirmed-via-docs`):

| Endpoint | Use |
|---|---|
| `POST /v1/sign_in_tokens` `{user_id, expires_in_seconds}` | mint ticket. **Override the 30-day default → ~60–120s.** |
| `POST /v1/users` `{phone_number:['+237…'], skip_password_requirement:true}` | new signup; Clerk auto-marks the phone **verified** → webhook + `getOrCreateCurrentUser` still see a verified phone. |
| `GET /v1/users?phone_number=%2B237…` | existing sign-in: find the Clerk user owning the phone. |

**Signup vs sign-in** both converge on the same client ticket flow; the only
difference is create-vs-lookup on the Backend API. If `POST /v1/users` 422s on a
phone Clerk already owns, fall back to the lookup branch (treat as existing).

## Device-bind flow (the cost-saver)

`expo-secure-store@56.0.4` is installed; **`expo-crypto` and
`expo-local-authentication` are NOT** (`npx expo install expo-crypto
expo-local-authentication`). Pure managed/dev-client Expo cannot generate/sign with
an asymmetric keypair (`expo-crypto` only does random + digest), so the **baseline
credential is a 256-bit random bearer secret**, honestly framed as "possession of
an OS-protected secret," not hardware-attested identity.

- **Mint** `deviceSecret = Crypto.getRandomBytesAsync(32)` (base64url) +
  `deviceId = Crypto.randomUUID()` after the first successful WhatsApp verify.
- **Store** the secret in `expo-secure-store` with
  `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (blocks iCloud/backup
  migration), `requireAuthentication: true` (OS biometric/passcode gate on every
  read), `keychainService: 'njangi.device'`, localized FR/EN `authenticationPrompt`.
  Store `deviceId` in a **separate, non-authenticated** key so the app can show
  "this device is registered" without a biometric prompt.
- **Register** server-side: `devices` row holds only `secretHash =
  SHA-256(salt + secret)` + the Clerk user id (captured from the live session).
- **Re-auth (`deviceLogin`)** on app relaunch when no valid Clerk session:
  biometric-read the secret → present `{deviceId, secret}` → server constant-time
  compares the hash, checks `revokedAt == null` and `lastSeenAt` not stale → mints a
  Clerk sign-in ticket → client `create({strategy:'ticket'})` + `setActive`.
  **No WhatsApp message.** This is the whole point.
- **Biometric layers:** (1) daily app-unlock = the same OS gate that releases the
  secret; (2) **money-action step-up** (confirm payout, accept pot, "j'ai reçu",
  president override) must **NOT** reuse that gate — see must-fix #7.

**Config gotchas (encode these or device-bind silently degrades to OTP-per-launch):**
- `requireAuthentication` needs `NSFaceIDUsageDescription` via the
  **expo-secure-store config plugin** — `app.json` currently lists
  `"expo-secure-store"` as a **bare string**; convert to the array form with the
  FR/EN permission string.
- Keys are **hardware-invalidated** when biometrics change (new fingerprint /
  re-enrolled Face ID) → next read throws → wrap every gated read in try/catch and
  fall back to **one** WhatsApp re-enrollment, never a crash.
- iOS Simulator can't do gated reads; some Android 14 face-only enrollments throw
  `ERR_SECURESTORE_AUTH_NOT_CONFIGURED` → guarded fallback required.

**Later hardening (real fix for bearer-secret extraction):** native Expo module →
EC P-256 keypair in iOS Secure Enclave (`kSecAttrTokenIDSecureEnclave`) / Android
StrongBox (`setIsStrongBoxBacked(true)`), only the public key leaves the device,
re-auth becomes nonce challenge-response. The `devices` table, `deviceLogin`, and
ticket-consumption code are written so only the verify step changes
(hash-compare → signature-verify).

## Convex backend

Crypto via **Web Crypto** (`crypto.subtle`, `crypto.getRandomValues`) — available
in the default Convex runtime, **no `"use node"`** needed. OTP request/verify/
deviceLogin run **before any session exists**, so they are **public unauthenticated
actions**; actions can't touch `ctx.db`, so all state I/O goes through
internal mutations/queries.

### New tables (`convex/schema.ts`)

**`otpChallenges`** — the hashed, single-use, TTL'd, attempt-bounded possession proof.
```
phone: string            // E.164, normalizePhone() before insert/lookup
codeHash: string         // SHA-256(salt + code) — plaintext code NEVER stored
salt: string             // per-challenge random hex, 16+ bytes
purpose: 'login' | 'device_register' | 'phone_change'
attemptsRemaining: number   // starts 5, decremented per verify, row burned at 0
sendCount: number           // resend counter within window
lastSentAt: number          // drives 60s per-phone cooldown
expiresAt: number           // lastSentAt + 5 min
consumedAt?: number         // set on success — THE fresh-possession proof
requestIp?: string          // best-effort per-IP throttle
requestDeviceId?: string    // client-supplied, per-device throttle
// indexes: by_phone, by_phone_and_purpose, by_expires_at (cron sweep),
//          by_request_ip
```

**`devices`** — binds a possession proof to one handset.
```
userId: Id<'users'>
clerkUserId: string      // captured at registration so deviceLogin needs no JWT
phone: string            // denormalized E.164 at bind time → revoke-all-for-phone
deviceId: string         // opaque, from secure-store
secretHash: string       // SHA-256(salt + deviceSecret); raw secret never stored
salt: string
platform: pushPlatformValidator   // reuse existing 'web'|'android'|'ios'
label?: string           // "Tecno Spark — Douala"
createdAt, lastSeenAt: number
revokedAt?: number       // SIM-swap / lost-phone kill switch
// indexes: by_user, by_device_id, by_user_and_device, by_phone
```

### Functions (`convex/otp.ts` new, `convex/devices.ts` new, `convex/users.ts`)

| Fn | Kind | Responsibility |
|---|---|---|
| `requestOtp({phone, purpose, deviceId?, lang})` | action (public) | validate E.164 → `internal.otp.reserveChallenge` (enforces all throttles, generates code, stores hash) → `sendOtp` port (WhatsApp). On send failure `internal.otp.rollbackSend` to refund cooldown. Returns `{ok, retryAfterMs?}` — **never** the code, **never** whether the phone is known (anti-enumeration). |
| `verifyOtp({phone, code, purpose, deviceId?, deviceLabel?, platform?})` | action (public) | `internal.otp.consumeChallenge` (atomic check-decrement-burn, constant-time hash compare) → resolve/create Clerk user → `POST /v1/sign_in_tokens` → if `deviceId`, `internal.devices.register` + return `deviceSecret` once → return `{ok, ticket, shouldRegisterDevice?, deviceSecret?}`. **Sole invoker of `setVerifiedPhone`.** |
| `deviceLogin({deviceId, deviceSecret})` | action (public) | `internal.devices.getByDeviceId` → `verifyAndTouch` (constant-time compare, revoked/stale checks) → mint ticket. **No WhatsApp.** Re-asserts existing identity only — never sets/changes `users.phone`, never links. |
| `registerDevice({deviceId, deviceSecret, platform, label?})` | mutation (authenticated) | standalone bind/rotate for an already-signed-in session; derives `userId` from `getCurrentUser`, never from an arg. |
| `internal.users.setVerifiedPhone({userId, phone, verificationProof})` | internalMutation | **the ONLY writer of `users.phone` and ONLY caller of `linkMembershipsByPhone`** (see linkGuard). |
| `internal.otp.sweepExpired` | internalMutation (cron) | purge expired/consumed challenges so hashes don't linger and daily counts stay cheap. Add to `convex/crons.ts`, ~30–60 min. |

**Keep `deviceLogin` a Convex action (outbound fetch), NOT a new `convex/http.ts`
route** — preserves the custody-free red-line invariant that `http.ts` holds only
the svix webhook + `/health`. (The device facet originally proposed an httpAction;
the threat review (T-10) overrides that.)

### 🔒 linkGuard — the money-bearing chokepoint

`linkMembershipsByPhone` grants a fresh account a pre-existing membership + full
ledger history + payout position. **Today it is safe only because the phone arrives
pre-verified from Clerk SMS.** Once OTP delivery leaves Clerk, the webhook phone and
JWT claim are **no longer possession-verified by anything Clerk did** — so every
path that sets `users.phone` without a fresh possession proof must be closed:

1. **`createUserFromClerk`** (webhook `phone_numbers[0]`) → insert `phone = undefined`,
   **do not link**.
2. **`getOrCreateCurrentUser`** → **stop reading `identity.phoneNumber`**, insert
   `phone = undefined`, **do not link**. (This is the most dangerous self-assertion
   path today: any session whose JWT carries a phone claim self-links memberships.)
3. **`updateUserFromClerk`** → sync name/avatar only, **ignore phone** for setting/
   linking.

**New single chokepoint `setVerifiedPhone`** is the only writer of `users.phone` and
only caller of `linkMembershipsByPhone`. It:
- **re-validates** a freshly-consumed `otpChallenges` row server-side — matching the
  **exact normalized phone**, `purpose ∈ {login, phone_change}`, and `consumedAt`
  within a **seconds-long grace window** — never trusting a client-passed boolean or
  a bare `challengeId`;
- runs `phoneIfAvailable` for the existing uniqueness guard;
- on a phone **change**: also calls `devices.revokeAllForPhone(oldPhone)` and emits
  the group-visible `phone_changed` activity event.

Net: no unverified phone self-assertion remains — not the webhook, not the JWT
claim, not a client arg. Only a live WhatsApp possession proof moves a phone onto a
user or fires the membership link.

### Rate limiting / hygiene
- OTP **TTL 5 min**. Code = **6 digits from `crypto.getRandomValues`** (lint-ban
  `Math.random` in `convex/otp.ts`); consider 8-digit for money-grade.
- Per-phone **60s resend cooldown** + **daily cap ~5–8**; **per-IP** + **per-device**
  soft caps. **One active challenge per `(phone, purpose)`** (kills parallel
  guessing). **Global daily verify cap per phone** independent of sends.
- **Hashed at rest** (per-challenge salt); plaintext code lives only in action
  memory long enough to send. **Constant-time compare on fixed-length hex digests** —
  never raw strings (length/timing oracle). **Never log** the code/secret/clear
  phone — key logs off `challengeId` + a phone-hash.
- `rollbackSend` must not let forced failures bypass the 60s gate.

## WhatsApp delivery (web-verified)

**Provider strategy — start behind a Verify-style aggregator, abstract behind one
port.** The no-WhatsApp fallback is the whole game in Cameroon, and aggregators
(Twilio/Vonage/Sinch/Infobip Verify) give WhatsApp→SMS→voice cascade + template/
WABA/compliance offload out of the box. Migrate the WhatsApp leg to Meta-direct
later for cost once volume justifies the operational burden.

```ts
// one port; Meta-direct OR aggregator behind it
sendOtp(phone: E164, code: string, lang: 'fr'|'en',
        channelPreference?: ('whatsapp'|'sms'|'voice')[])
  : { channelUsed, providerRef, status }
```
Design the port for **both** "we own the code" (Meta-direct: we generate/store/verify,
pass code in body + button) and "provider owns the code" (aggregator returns a
verification SID we later confirm) modes.

**Fallback ladder:** 1) WhatsApp auth template (primary) → 2) **SMS** (mandatory
safety net for no-WhatsApp +237) → 3) **voice OTP** (user-triggered "call me") →
4) flash-call **deferred** (Cameroon route viability unconfirmed; iOS can't auto-read
CLI).

**AUTHENTICATION template** (Meta, pre-approved, billed): Meta supplies the body
(`"{{1}} is your verification code."`); you only pass the OTP. No custom text, no
URLs/media/emojis, **OTP cannot be in a URL**. **Each language is a separate
approved template** → fr + en = **two approvals**. One button required —
**COPY_CODE** default (all devices); ONE_TAP/ZERO_TAP are Android-only and
auto-degrade to copy-code elsewhere (one-tap needs your package + signing-key hash
registered with Meta). **Send payload puts the same code in both the body param and
the button param (index 0).**

**Pricing:** per-message auth model since 1 Jul 2025. Cameroon = "Rest of Africa"
zone, **~$0.004/msg** (BSP-mirrored; confirm in WABA dashboard). **Cameroon is NOT
on the auth-international surcharge list** — but **Nigeria & South Africa diaspora
numbers ARE** (3–18× rate), so a `+234`/`+27` member is materially pricier. New
sender numbers ramp through messaging tiers and are quality-rated; sending to
no-WhatsApp numbers drives blocks/reports and **tanks the quality rating** — another
reason the SMS fallback matters operationally, not just for UX.

**Recipient language pre-session** must come from the **client** (AsyncStorage
`njangi-language`, set pre-auth per docs/03) passed into `requestOtp` — anti-
enumeration forbids deriving it from a server lookup of the (maybe-unknown) phone.

## Env / secrets
- **`CLERK_SECRET_KEY`** must live in **Convex env only** (`npx convex env set`),
  never the Expo client bundle. It can mint a sign-in token for **any** user (full
  account + payout-history takeover) — the single most catastrophic key here.
  ⚠️ It currently sits in `.env.local` (and an untracked `.env.local.bak`).
  Expo only inlines `EXPO_PUBLIC_*`-prefixed vars into the client bundle, so a bare
  `CLERK_SECRET_KEY` is **not** auto-embedded — but it should not live in an
  app-read `.env` at all. Move it to Convex env, delete it from `.env.local*`,
  add a CI grep that fails if any non-`EXPO_PUBLIC_` secret appears in app-read
  `.env*`, and **rotate** it if it was ever committed/shared.
- New Convex env: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_TEMPLATE_NAME` (or the aggregator's keys). All Convex-env-only.

## Threat model — verdict & must-fix

**Verdict: CONDITIONAL.** Architecture is sound (Clerk stays session authority;
only OTP delivery moves; linkGuard + short-TTL ticket + throttle are the right
mitigations). **Do not ship for a money app until the must-fix list is done.** Two
risks are **critical and irreducible by app crypto — accept-and-monitor**:

- **T-04 SIM-swap / WhatsApp-account takeover** — phone = identity = MoMo by design.
  A SIM-swap (bribed carrier agent, common in Cameroon) re-registers WhatsApp on the
  number, passes `verifyOtp` legitimately, inherits membership/ledger/payout. Not
  solvable in-app. Blast-radius controls only: group-visible `phone_changed` event
  (president sees it), `revokeAllForPhone`, and a **velocity gate** blocking
  payout-confirm / accept-pot / "j'ai reçu" / reliability-merge for N hours after a
  fresh phone-link or device-bind. The custody-free design caps real damage — the
  app never moves funds.
- **T-06 bearer-device-secret extraction** on rooted handsets — until the Secure
  Enclave/StrongBox keypair upgrade.

**Must-fix before ship:**
1. **Implement the linkGuard chokepoint** (T-03/T-11/T-12) — three live paths
   (webhook phone, JWT `phoneNumber`, `updateUserFromClerk`) currently fire
   `linkMembershipsByPhone` without a fresh proof. `setVerifiedPhone` re-validates
   the consumed challenge server-side.
2. **No magic/dev OTP bypass in server `verifyOtp`** (T-02). The `__DEV__`
   hands-free VERIFY path (commit `9a20364`) and `dev-tools.tsx` `TEST_CODE` are a
   fixed-credential backdoor by construction. Dev path must mint a real ticket
   through the **same** verify code path, gated on a server env flag that **throws at
   module load** if `NODE_ENV === 'production'`. Add CI grep banning
   `TEST_CODE`/`magic`/`bypass` in `convex/otp.ts`. Note: this dev path currently
   rides Clerk SMS, which the dashboard hardening disables — it **will** break and
   must be rebuilt on the ticket path.
3. **OTP integrity** (T-01/T-09): CSPRNG codes only; rotate code on resend; one
   active challenge per `(phone,purpose)`; global daily verify cap; constant-time
   fixed-length compare; consume in a **single atomic** internalMutation.
4. **Ticket hygiene** (T-05): `expires_in_seconds` ~60–120s (never the 30-day
   default); single-use; never log/persist/transport beyond the immediate
   `setActive`; `CLERK_SECRET_KEY` Convex-env-only; rate-limit `deviceLogin` per
   `deviceId`+IP.
5. **Cost-bomb breaker** (T-07): per-IP (CGNAT) and per-device (spoofable) caps are
   soft in Cameroon → add a **global daily WhatsApp send budget + circuit-breaker +
   ops alert**, and an **app-attestation (Play Integrity / App Attest)** or
   proof-of-work gate before the first send.
6. **SIM-swap blast-radius** (T-04/T-06): `revokeAllForPhone` on relink, emit the
   `phone_changed` event (push president+treasurer, not buried in the feed), velocity
   gate, and **ship a device-revoke UI before GA** (launch-blocking).
7. **Money step-up ≠ device-unlock gate** (T-06/T-04): a separate app-level
   PIN/biometric for payout-confirm/accept-pot so a stolen **unlocked** phone can't
   drain trust in one gesture.
8. **Anti-enumeration** (T-08): identical response shape **and timing** for known vs
   unknown phones (pad the Clerk-lookup branch to a constant budget).
9. **Keep `deviceLogin` a Convex action**, not an `http.ts` route (T-10).
10. **Document the 256-bit-entropy constraint** at the device-secret hashing site —
    plain salted SHA-256 is safe **only** for high-entropy input; hard-ban
    substituting a user-chosen PIN.

## Open gaps to resolve before build (from completeness review)

These are **not yet specified** and block a complete spec:

- **Phone-change flow** — no end-to-end UX/server flow. Must require OTP possession
  of the **new** number while already authenticated to the **old** identity; update
  the Clerk primary phone via Backend API (or JWT/webhook diverge from `users.phone`);
  **migrate `memberships.phone`** (denormalized — changing `users.phone` does NOT
  rewrite it, silently de-linking the member from their own seeded memberships);
  handle collision when the new number already belongs to another account /
  feature-phone membership (a phone-change is a membership-grab vector identical to
  T-03).
- **`reliabilityStats` merge on link** — referenced by the velocity gate and the
  schema, but has **zero writers/readers** in `convex/` today and
  `linkMembershipsByPhone` doesn't touch it. Define where the phone-keyed →
  userId-keyed merge happens, idempotency, and how a gate "blocks" a non-existent
  code path.
- **`phone_changed` / `member_linked` events** — the SIM-swap social audit. Schema
  documents `phone_changed` but it is **never emitted**; `member_linked` is an
  actor-less feed line. Define payload, make it undismissable/push-notified to
  president+treasurer, emit from `setVerifiedPhone` on every relink.
- **Migration of existing Clerk-SMS users** — grandfather existing `users.phone`
  (don't null them); first post-cutover login must not destructively re-run
  `linkMembershipsByPhone`; confirm existing users resolve via
  `GET /v1/users?phone_number` (works only if Clerk still holds the phone as a
  verified identifier); define the rollback plan if WhatsApp delivery proves worse
  than SMS in Cameroon.
- **Feature-phone coexistence** — state explicitly that non-authing
  `addFeaturePhoneMember` members are unaffected at rest, and that their eventual
  signup **is** the canonical `setVerifiedPhone` link path (this is the linkGuard's
  main job; `addFeaturePhoneMember` seeds the trap T-03 closes).
- **Diaspora numbers** — WhatsApp deliverability/pricing differ; Nigeria/SA carry the
  auth-international surcharge; flash-call often blocked internationally. Define the
  WhatsApp→SMS→voice fallback for non-`+237` members so a valued segment isn't
  silently locked out.
- **Account deletion** — `deleteUserByClerkId` only soft-deletes. New: revoke/purge
  `devices` rows (else a deleted user can `deviceLogin` back in with no OTP), delete
  the Clerk user, define phone-uniqueness reclaim semantics (a freed-then-reclaimed
  phone re-triggers the link surface against a soft-deleted ledger).
- **Multi-device** — cap devices per user (unbounded = unbounded ticket oracles);
  reinstall loses `deviceId` and orphans the old credential until staleness;
  `listMyDevices`/`revokeDevice` + the device-management UI are launch-blocking yet
  unassigned to a screen.
- **i18n** — fr/en auth templates (two Meta approvals), the device "new device added"
  security notice, and `authenticationPrompt` strings; locale comes from the client.
- **expo-secure-store config plugin** — `app.json` has the bare string; convert to
  array form with `NSFaceIDUsageDescription` (FR/EN) or gated reads throw on iOS.
- **Observability** — define the phone-hashing scheme for logs (correlatable for ops
  vs PII-leaking), a lint/CI rule that `requestOtp`/`verifyOtp`/`deviceLogin` never
  log code/secret/clear-phone, and the **delivery channel** for the circuit-breaker
  and new-device/new-geo alerts (no ops/security alert surface exists today;
  `activityEvents` is group-scoped, not ops).

## File touchpoints (summary)

| File | Change |
|---|---|
| `convex/schema.ts` | add `otpChallenges`, `devices` tables + indexes |
| `convex/otp.ts` (new) | `requestOtp`, `verifyOtp`, `deviceLogin` + internal mutations (reserve/rollback/consume/sweep); WhatsApp + Clerk fetches |
| `convex/devices.ts` (new) | internal `getByDeviceId`, `register`, `verifyAndTouch`, `revokeAllForPhone`; `listMyDevices`, `revokeDevice` (authed) |
| `convex/users.ts` | add `setVerifiedPhone` (sole phone writer + linker); strip phone-set/link from `getOrCreateCurrentUser`, `createUserFromClerk`, `updateUserFromClerk` |
| `convex/http.ts` | webhook stops forwarding phone (name/avatar only); **no new route** |
| `convex/crons.ts` | `internal.otp.sweepExpired` interval |
| `convex/auth.config.ts` | unchanged |
| `src/components/clerk-auth-screen.tsx` | replace native Clerk `AuthView` (SMS OTP) with custom phone→WhatsApp-code UI → ticket flow; register device on first verify |
| `src/lib/device-credential.ts` (new) | `ensureDeviceSecret` / `readDeviceSecret` (gated, try/catch→OTP fallback) / `clearDeviceSecret` |
| `src/hooks/use-device-login.ts` (new) | biometric-read → `deviceLogin` → ticket → `setActive`; runs before the OTP screen |
| `src/components/dev/dev-tools.tsx` | rebuild dev sign-in on the ticket path; load-time prod guard |
| `package.json` | `expo-crypto`, `expo-local-authentication` |
| `app.json` | expo-secure-store plugin → array form + FaceID permission |
| Convex env | `CLERK_SECRET_KEY` (move here, rotate), `WHATSAPP_*` |
