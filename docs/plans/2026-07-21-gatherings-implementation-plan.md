# Gatherings Implementation Plan

**Date:** 2026-07-21  
**Design:** [Gatherings + Njangis: Cameroon Mobile Money Design](./2026-07-21-gatherings-mobile-money-design.md)  
**Delivery strategy:** direct-to-recipient Mobile Money first; no custody

## Objective

Ship a pilot-ready one-time Gathering flow alongside the existing recurring
Njangi product:

- an authenticated organizer creates and opens a private Gathering;
- the organizer shares one WhatsApp link;
- a contributor can understand the request without installing the app;
- the contributor verifies a Cameroon phone number, pays the disclosed
  recipient outside the platform, and claims the contribution;
- the named recipient confirms receipt;
- only confirmed contributions count toward visible progress;
- the platform never presents or holds a balance.

The work must preserve the current Njangi state machines and release lanes.

## Non-negotiable gates

Before a public pilot:

1. Validate phone/WhatsApp OTP delivery to MTN and Orange numbers on real
   Cameroon devices.
2. Confirm the Clerk instance can support a minimal phone-code flow without
   weakening the existing username/password and Google flows.
3. Restore the project's `linkGuard` design so only cryptographically verified
   phone ownership can link an account to a phone identity.
4. Publish privacy, support, terms, abuse-reporting, and account-deletion pages.
5. Obtain Cameroon counsel review of the direct-to-recipient flow and copy.
6. Do not add MTN, Orange, or aggregator payment webhooks during this milestone.

If phone OTP proves unreliable or too expensive, stop before contributor
claims. A read-only public page plus forced full-account sign-up is not an
acceptable substitute for the approved low-friction design.

## Milestone 0 — Product and identity spike

### 0.1 Validate contributor authentication

Use the existing
[`docs/auth-whatsapp-otp-devicebind-spec.md`](../auth-whatsapp-otp-devicebind-spec.md)
as the security baseline rather than accepting phone numbers from client input
or Clerk webhooks.

Tasks:

- Enable Cameroon on the Clerk SMS allowlist in the development instance.
- Test SMS and, if enabled for the account, WhatsApp OTP delivery on one MTN
  and one Orange number.
- Confirm the custom Expo web flow supports existing-user sign-in and new-user
  sign-up without requiring a password during the contribution moment.
- Decide whether the contribution flow creates a normal account immediately or
  completes through a short-lived Clerk ticket followed by optional account
  completion.
- Record message delivery time, retry behavior, cost, and failure copy.
- Verify that a signed-in user with an existing username/email account can add
  and verify a phone without creating a duplicate account.

Deliverable:

- Add a short decision section to the auth spec documenting the selected
  contributor identity flow and exact trusted proof used by Convex.

Acceptance:

- An unverified client-supplied phone can never populate `users.phone`.
- The same verified phone cannot silently create two app identities.
- A returning contributor can complete verification without remembering a
  password.

### 0.2 Validate the narrow web surface

Use the existing Expo Router app and EAS Hosting. Do not introduce a second
frontend framework.

Tasks:

- Add explicit Expo web output configuration in `app.json`.
- Start with `single` output because the private dynamic share route does not
  require SEO and must resolve arbitrary share codes.
- Confirm `npx expo export --platform web` succeeds with the current providers,
  fonts, Sentry wrapper, NativeWind styles, and platform-specific modules.
- Confirm a route outside `(app)` renders while signed out and does not redirect
  to `/sign-in`.
- Confirm direct navigation and refresh work for `/g/<shareCode>` in a local
  production export.
- Document preview and production EAS Hosting commands in the release runbook.

Expected files:

- `app.json`
- `package.json`
- `app/_layout.tsx`
- `src/lib/env.ts`
- `docs/release-runbook.md`

Acceptance:

- Native iOS and Android bundles still export.
- The web export exposes no authenticated app routes as publicly usable pages.
- Public pages can query only explicitly public Gathering functions.

## Milestone 1 — Domain model and pure lifecycle logic

### 1.1 Add Gathering validators and tables

Read `convex/_generated/ai/guidelines.md` before implementation.

Add validators in `convex/schema.ts`:

- `gatheringStatusValidator`: `draft | open | closed | cancelled`
- `gatheringPurposeValidator`: `funeral | wedding | birthday | school | trip |
  gift | church | family_support | other`
- `gatheringAmountModeValidator`: `fixed | suggested | open`
- `gatheringContributionStateValidator`: `claimed | confirmed | disputed |
  cancelled`
- reuse `paymentMethodValidator`, `proofTypeValidator`, and
  `disputeReasonValidator` where semantics match exactly

Add tables:

#### `gatherings`

- `title`
- `description?`
- `purpose`
- `status`
- `organizerUserId`
- `recipientUserId`
- `recipientNameSnapshot`
- `amountMode`
- `contributionAmount?`
- `goalAmount?`
- `deadlineAt`
- `language`
- `shareCode`
- `shareCodeVersion`
- `openedAt?`
- `closedAt?`
- `cancelledAt?`
- `createdAt`

Indexes:

- `by_organizer_user_id`
- `by_recipient_user_id_and_status`
- `by_share_code`
- `by_status_and_deadline_at`

#### `gatheringPaymentDestinations`

- `gatheringId`
- `method`: MTN MoMo, Orange Money, or cash only for the first release
- `accountPhone?`
- `accountName`
- `createdByUserId`
- `createdAt`

Indexes:

- `by_gathering_id`

Rules:

- destination details become immutable when the Gathering opens;
- a Gathering has at most one destination per Mobile Money provider;
- the recipient must explicitly accept destination ownership before opening.

#### `gatheringContributions`

- `gatheringId`
- `contributorUserId`
- `contributorNameSnapshot`
- `recipientUserId`
- `state`
- `method`
- `amount`
- `idempotencyKey`
- `transactionReference?`
- `proofType`
- `proofStorageId?`
- `claimedAt`
- `confirmedAt?`
- `disputedAt?`
- `cancelledAt?`

Indexes:

- `by_gathering_id`
- `by_gathering_id_and_state`
- `by_contributor_user_id`
- `by_recipient_user_id_and_state`
- `by_gathering_id_and_idempotency_key`

Do not store a denormalized Gathering balance. Compute bounded pilot progress
from contributions, then add counters only if measured query volume requires
them.

#### `gatheringActivityEvents`

- `gatheringId`
- `actorUserId?`
- `kind`
- bounded structured metadata for the event kind
- `createdAt`

Indexes:

- `by_gathering_id`

Do not store an unbounded event array on the Gathering document.

Expected files:

- `convex/schema.ts`
- `convex/lib/gatheringStateMachine.ts`
- `convex/lib/gatheringStateMachine.test.ts`

### 1.2 Encode lifecycle invariants as pure functions

Test before wiring mutations:

- draft details may change only in `draft`;
- only a valid draft can open;
- open may become closed or cancelled;
- terminal Gatherings never reopen in the pilot;
- only open Gatherings accept claims;
- claimed may confirm, dispute, or cancel;
- disputed may confirm or cancel;
- confirmed is immutable except through an explicit future correction design;
- positive whole XAF amounts only;
- fixed amount must match exactly;
- goal amount is informational and never blocks overfunding;
- deadlines and amount limits are enforced server-side.

## Milestone 2 — Authenticated organizer and recipient API

### 2.1 Gathering mutations

Create `convex/gatherings.ts` with full argument and return validators:

- `createDraft`
- `updateDraft`
- `setPaymentDestination`
- `inviteRecipient`
- `acceptRecipient`
- `open`
- `close`
- `cancel`
- `rotateShareCode`
- `listMine`
- `getOrganizerView`

Authorization:

- derive all user IDs from `ctx.auth.getUserIdentity()`;
- organizer-only for draft/open/close/cancel/share rotation;
- recipient-only for destination acceptance;
- no client-supplied user ID may grant authority;
- opening requires an accepted recipient, at least one payment destination,
  valid amount settings, and a future deadline.

Share codes:

- use at least 128 bits of cryptographically secure randomness;
- never use sequential database IDs;
- rotate by incrementing `shareCodeVersion` and invalidating the prior code;
- do not log raw share URLs in server logs or analytics.

### 2.2 Organizer/recipient integration tests

Create `convex/gatherings.integration.test.ts` covering:

- organizer creates and edits a draft;
- outsider cannot read organizer details or mutate a draft;
- recipient must accept before open;
- organizer cannot impersonate recipient acceptance;
- invalid amounts, deadlines, and methods are rejected;
- payment destination cannot change after open;
- closing and cancelling are idempotent;
- old share code stops resolving after rotation;
- list queries are bounded;
- every state change emits an attributed activity event.

## Milestone 3 — Contribution acknowledgement API

### 3.1 Contribution functions

Create `convex/gatheringContributions.ts`:

- `claim`
- `confirm`
- `dispute`
- `withdraw`
- `listForOrganizer`
- `listAwaitingRecipient`
- `getMine`
- `generateProofUploadUrl`

Rules:

- contributor identity must be authenticated and phone-verified through the
  Milestone 0 trusted path;
- recipient and contributor must differ for two-sided acknowledgement;
- if organizer/recipient contributes to their own Gathering, use an explicit
  self-record path with an attributed activity event;
- `claim` requires an open Gathering and a supported destination;
- unique idempotency keys make retries no-ops;
- duplicate transaction references within a Gathering are rejected or flagged;
- only the named recipient can confirm or dispute;
- only the contributor can withdraw an unconfirmed claim;
- proof images are private and never returned by public queries;
- only confirmed amounts count toward confirmed progress.

### 3.2 Public read API

Create `convex/gatheringPublic.ts` with an unauthenticated, bounded query:

- `getByShareCode`

Return only:

- title, description, purpose, language, status, and deadline;
- organizer display name;
- recipient display name;
- masked destination details until the contributor intentionally chooses a
  payment method;
- goal, confirmed total/count, and awaiting-confirmation count;
- allowed methods;
- an explicit custody statement;
- whether the share code is valid.

Do not return:

- full contributor list;
- contributor phone numbers;
- transaction references;
- proof URLs;
- internal user or document IDs;
- private activity metadata.

If revealing the full destination number is required to pay, expose it through
a separate rate-limited action that records intent and returns only the chosen
method's destination.

### 3.3 Contribution integration tests

Create `convex/gatheringContributions.integration.test.ts` covering:

- public query sanitization;
- valid claim and recipient confirmation;
- fixed/suggested/open amount behavior;
- idempotent retry;
- duplicate reference behavior;
- outsider confirmation rejection;
- contributor withdrawal;
- recipient dispute and resolution;
- no claims after close/cancel/deadline;
- confirmed progress excludes claimed/disputed/cancelled rows;
- proof privacy;
- self-record attribution;
- bounded public response under many contributions.

## Milestone 4 — Native organizer experience

### 4.1 Navigation and home entry points

Add two clear creation actions without replacing the existing Today experience:

- “Collect for something”
- “Run a njangi”

Expected files:

- `app/(app)/(tabs)/index.tsx`
- `app/(app)/_layout.tsx`
- `src/i18n/locales/fr.json`
- `src/i18n/locales/en.json`

The Today screen remains action-first. Gathering confirmation work should later
enter the same Attention system rather than creating a parallel inbox.

### 4.2 Creation flow

Add:

- `app/(app)/gatherings/new.tsx`
- `app/(app)/gatherings/[gatheringId]/index.tsx`
- `app/(app)/gatherings/[gatheringId]/recipient.tsx`
- `src/components/gatherings/gathering-progress.tsx`
- `src/components/gatherings/payment-destination-card.tsx`
- `src/components/gatherings/gathering-share.tsx`

Creation flow:

1. purpose, title, optional description/photo;
2. recipient and payment destinations;
3. fixed/suggested/open amount, optional goal, deadline;
4. review custody statement;
5. open and share.

Use one screen with progressive sections or a shallow stack. Do not build a
long multi-page wizard unless usability tests show the single flow is too dense.

### 4.3 Organizer detail

Show:

- confirmed progress and awaiting count;
- recipient and destination summary;
- contributor rows visible only to authorized users;
- share action;
- close/cancel/link-rotation controls;
- activity history.

Never label confirmed progress as a balance.

## Milestone 5 — Public WhatsApp contribution route

### 5.1 Route and signed-out rendering

Add a root public route outside `(app)` and `(auth)`:

- `app/g/[shareCode].tsx`

Register it in `app/_layout.tsx` without an auth redirect. Keep the Clerk and
Convex providers so an anonymous viewer can read public data and transition
into phone verification when claiming.

The page must include:

- clear purpose and parties;
- confirmed progress;
- deadline;
- MTN MoMo, Orange Money, and cash options;
- exact custody statement;
- unavailable/closed/cancelled states;
- French and English copy;
- small-screen and low-bandwidth layout;
- app-install prompt only after the primary contribution action.

### 5.2 Payment instruction step

Add reusable presentation logic rather than copying the Njangi round flow:

- `src/lib/mobile-money-instructions.ts`
- `src/components/contributions/payment-method-picker.tsx`
- `src/components/contributions/mobile-money-instructions.tsx`

Refactor existing Njangi USSD content only when behavior is identical. Keep
Gathering destination and Njangi treasurer/beneficiary authorization separate.

Opening the dialer or copying instructions must not create a claim. The claim
begins only after the contributor explicitly says they paid.

### 5.3 Minimal verified contributor flow

Add a public phone-code screen or sheet tied to the Milestone 0 decision:

- verify `+237` phone ownership;
- create or resume the contributor identity;
- capture display name only when missing;
- return to the same Gathering and preserve the pending claim draft;
- never auto-link memberships from an unverified phone claim.

Expected files depend on the auth spike, but must include integration tests for
the `linkGuard` server boundary.

### 5.4 Claim durability

Reuse `createDurableQueue` with a Gathering-specific storage key and entry type:

- save amount, method, optional transaction reference, proof upload state, and
  idempotency key locally;
- serialize retries;
- distinguish retryable network errors from permanent validation errors;
- show “saved on this phone” and last synchronization state;
- never duplicate a claim after reconnect.

Expected files:

- `src/lib/gathering-claim-queue.ts`
- `src/lib/gathering-claim-queue.test.ts`
- public route claim UI

## Milestone 6 — Recipient confirmations and Attention integration

### 6.1 Recipient work

Add Gathering confirmation actions to `convex/attention.ts`:

- one action per Gathering with a bounded count and total awaiting confirmation;
- destination opens the Gathering detail or a focused confirmation list;
- waiting facts belong to contributors, not the recipient.

Update:

- `src/lib/attention-navigation.ts`
- `src/lib/attention-presentation.ts`
- `src/components/attention/attention-card.tsx`
- FR/EN locale files

### 6.2 Notifications

Extend the existing push pipeline:

- recipient: contribution awaiting confirmation;
- contributor: confirmed or disputed;
- organizer: goal reached and deadline approaching;
- all deep links use an allowlisted Gathering path.

The in-app Attention surface remains the guaranteed channel; push is best
effort.

### 6.3 Tests

- Extend `convex/attention.integration.test.ts`.
- Extend `src/lib/attention-presentation` tests.
- Verify notification deep-link allowlisting.
- Verify bounded aggregation for many claims.

## Milestone 7 — Sharing, public pages, and release pipeline

### 7.1 WhatsApp share content

Generate French and English text containing:

- purpose;
- organizer and recipient names;
- fixed/suggested amount when applicable;
- deadline;
- public link;
- “Money goes directly to the named recipient through Mobile Money.”

Do not include the recipient's full phone number in the WhatsApp message.

### 7.2 Required public pages

Add:

- `app/privacy.tsx`
- `app/support.tsx`
- `app/terms.tsx`
- `app/report.tsx`

Legal copy must cover:

- direct person-to-person money movement;
- organizer responsibility;
- transaction references and optional proof images;
- identity, retention, deletion, and processors;
- cancellations and the absence of platform refunds;
- prohibited use and abuse reporting.

Counsel-approved content is a launch gate.

### 7.3 Hosting and release

Add scripts:

- `web:export`
- `eas:deploy:preview`
- `eas:deploy:production`

Update the release status script to report the latest web deployment alongside
native builds and OTA channels.

Deploy preview first. Production deployment requires a working custom domain,
TLS, privacy/support/terms pages, and a full public-route security review.

## Milestone 8 — Pilot hardening

### Automated verification

Run on every Gathering change:

```bash
bun run typecheck
bun run lint:design
bun run test:unit
bun run test:convex
npx expo export --platform web
npx expo export --platform ios
npx expo export --platform android
```

Add focused tests for:

- authorization and public-data minimization;
- lifecycle and idempotency;
- exact progress math;
- duplicate transaction references;
- share-code rotation;
- OTP throttling and account linking;
- offline claim replay;
- FR/EN strings and currency/date formatting;
- closed, cancelled, expired, and network-error states.

### Manual acceptance

Test on a low-end Android phone and real networks:

- organizer creates and shares in under two minutes;
- WhatsApp opens the public page without an installed app;
- MTN and Orange payment instructions are understandable;
- OTP works on both networks;
- weak connection does not duplicate a claim;
- recipient confirmation updates the contributor and progress;
- full phone numbers, references, and proof never leak publicly;
- link rotation invalidates the old WhatsApp URL;
- cancellation copy does not promise an app refund;
- native Njangi flows remain unchanged.

### Pilot rollout

Start with private, trusted Gatherings. Do not launch public discovery.

Instrument:

- create-to-share time;
- share opens;
- payment-instruction starts;
- claim completion;
- confirmation time;
- reconciliation support incidents;
- organizer repeat use;
- contributor-to-install conversion;
- Gathering-to-Njangi conversion.

## Milestone 9 — Licensed checkout discovery, not implementation

Only after direct-flow demand is demonstrated:

- obtain written product and settlement documentation from MTN, Orange, or a
  licensed aggregator;
- confirm whether organizers can be onboarded as merchants/submerchants;
- confirm settlement goes directly to the disclosed recipient;
- document KYC/KYA, fees, limits, reversals, refunds, fraud ownership, support,
  webhook signing, and reconciliation;
- obtain counsel approval;
- create a separate design before adding provider code.

Do not weaken the direct-to-recipient path if checkout is unavailable.

## Commit sequence

Keep changes reviewable:

1. `docs: record gathering identity and web-surface decisions`
2. `feat(gatherings): add lifecycle schema and pure rules`
3. `feat(gatherings): add organizer and recipient APIs`
4. `feat(gatherings): add contribution acknowledgement APIs`
5. `feat(gatherings): add native organizer flow`
6. `feat(gatherings): add public contribution route`
7. `feat(gatherings): add verified contributor claims`
8. `feat(gatherings): add attention and notification flows`
9. `chore(hosting): add public web release lane`
10. `test(gatherings): harden pilot scenarios`

Each commit must pass the tests relevant to its layer. Do not combine payment
provider integration with the direct-to-recipient pilot.

