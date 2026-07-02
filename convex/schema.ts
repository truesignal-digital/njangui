import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// ─────────────────────────────────────────────────────────────
// Shared validators — exported for reuse in convex/ function
// files and mirrored in @njangi/domain types.
// ─────────────────────────────────────────────────────────────

export const appLanguageValidator = v.union(v.literal('fr'), v.literal('en'));

export const membershipRoleValidator = v.union(
  v.literal('president'),
  v.literal('treasurer'),
  v.literal('member')
);

// Aligned with 02 §a — njangis are closed trust circles: an open invite
// link must never auto-admit. 'exited' covers both voluntary departure and
// removal (president-only, mandatory note — the note lives on the
// activityEvents transition row). The 'defaulting' badge (2 consecutive
// unpaid rounds, 02 edge case 1) is DERIVED from frozen round obligation
// statuses, never stored.
export const membershipStatusValidator = v.union(
  v.literal('pending_approval'), // joined via invite code; awaiting president/treasurer approval
  v.literal('active'), // approved, or added directly by treasurer/president (feature-phone or known member)
  v.literal('rejected'), // approval denied — row kept
  v.literal('exited'), // left voluntarily OR removed — row kept, never deleted
  v.literal('deceased') // president marks, mandatory note — drives 02 edge case 2's two payout branches
);

export const scheduleValidator = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly')
);

// How the pot moves. Many real njangis hand contributions directly to the
// beneficiary at the réunion (and MoMo groups avoid the double transfer fee
// of member→treasurer→beneficiary). The ledger must record reality.
export const collectionModeValidator = v.union(
  v.literal('via_treasurer'), // collected pot: contributions to treasurer, payout handed to beneficiary
  v.literal('direct_to_beneficiary') // contributions go straight to the round's beneficiary; no payout record
);

export const groupStatusValidator = v.union(
  v.literal('setup'), // members joining, order being drafted — no paymentRecords exist
  v.literal('active'), // cycle in progress
  v.literal('paused'), // round timers frozen; record timers (T_AUTO_CONFIRM/T_AUTO_DISPUTE) keep running (02 §a)
  v.literal('between_cycles'), // cycle complete; re-order/re-configure allowed; arrears stay payable
  v.literal('archived') // terminal, read-only forever
);

export const cycleStatusValidator = v.union(
  v.literal('draft'), // rotation order being arranged, editable
  v.literal('active'), // locked — rotationOrder changes only via orderChanges from here
  v.literal('completed'),
  v.literal('cancelled')
);

// Aligned with 02 §b. 'closed' means CONTRIBUTIONS closed (system-driven at
// graceEndAt) — the payout handshake runs in parallel and may still be
// pending; the round waits in 'payout' until the beneficiary confirms.
export const roundStatusValidator = v.union(
  v.literal('scheduled'),
  v.literal('open'), // collecting contributions; payout claimable from here
  v.literal('grace'), // past dueAt, before graceEndAt
  v.literal('closed'), // contributions closed; obligation statuses frozen; payout not yet confirmed
  v.literal('payout'), // waiting on the beneficiary to confirm the payout record
  v.literal('completed'), // payout confirmed (or no payout record in direct mode) — terminal
  v.literal('skipped'), // president skipped (mandatory note); later rounds shift one period — terminal
  v.literal('cancelled') // beneficiary exited/deceased; future round removed via system OrderChange (02 §a/§e) — terminal
);

// Per-member status frozen on the round at close (02 §b closing rule 1).
export const obligationStatusValidator = v.union(
  v.literal('on_time'), // confirmed sum ≥ expected, all claims at or before dueAt
  v.literal('late'), // satisfied, but some claim after dueAt
  v.literal('partial'), // confirmed sum > 0 but < expected
  v.literal('unpaid'), // zero confirmed
  v.literal('disputed') // a record still in dispute at close — scored at resolution
);

export const paymentKindValidator = v.union(
  v.literal('contribution'), // member → treasurer (or → beneficiary in direct mode), for a round
  v.literal('payout'), // treasurer → beneficiary, for a round (via_treasurer mode only)
  v.literal('fine'), // member → treasurer, settles a fines row
  v.literal('assistance') // member → treasurer, settles an assistanceLevies row
);

export const paymentStateValidator = v.union(
  v.literal('pending'), // expected, nothing logged yet
  v.literal('claimed'), // one side logged it; counterparty's window running
  v.literal('confirmed'), // counterparty acknowledged (or timer/on-behalf) — THE truth. Ledger-final.
  v.literal('disputed'), // counterparty rejected, or payer-side claim unconfirmed past T_AUTO_DISPUTE
  v.literal('cancelled') // withdrawn / excused / dispute resolved against / president override
);

export const paymentMethodValidator = v.union(
  v.literal('momo_mtn'),
  v.literal('orange_money'),
  v.literal('cash'),
  v.literal('bank') // accepted by schema now, hidden in UI until post-MVP
);

export const proofTypeValidator = v.union(
  v.literal('momo_txn_id'), // preferred, UI nudges toward it
  v.literal('screenshot'), // accepted, NOT trusted — dispute artifact only
  v.literal('none') // cash: confirmation IS the proof
);

export const paymentSideValidator = v.union(
  v.literal('payer'),
  v.literal('payee')
);

export const confirmationChannelValidator = v.union(
  v.literal('app'),
  v.literal('sms'), // future: SMS-reply confirmation for feature phones
  v.literal('meeting') // logged live in Meeting Mode
);

export const disputeReasonValidator = v.union(
  v.literal('not_received'),
  v.literal('wrong_amount'),
  v.literal('other')
);

export const disputeStatusValidator = v.union(
  v.literal('open'),
  v.literal('resolved_confirmed'), // payment did happen → record → confirmed
  v.literal('resolved_cancelled') // payment did not happen → record → cancelled
);

export const fineReasonValidator = v.union(
  v.literal('late_contribution'),
  v.literal('partial_contribution'),
  v.literal('unpaid_round'),
  v.literal('missed_meeting'),
  v.literal('other')
);

// Fines are system-proposed, human-confirmed (02 §f) — never auto-charged.
export const fineStatusValidator = v.union(
  v.literal('proposed'), // system-generated at round close per fine policy; member NOT yet notified
  v.literal('owed'), // president confirmed (amount editable) → pending paymentRecord (kind 'fine') created
  v.literal('paid'), // set only when a confirmed paymentRecord settles it
  v.literal('waived'),
  v.literal('dismissed'), // president dismissed, or auto-dismissed when the next round closes (stale proposals die quietly)
  v.literal('cancelled')
);

export const assistanceReasonValidator = v.union(
  v.literal('bereavement'),
  v.literal('wedding'),
  v.literal('birth'),
  v.literal('illness'),
  v.literal('other')
);

export const assistanceLevyStatusValidator = v.union(
  v.literal('open'),
  v.literal('closed'),
  v.literal('cancelled')
);

export const orderChangeKindValidator = v.union(
  v.literal('swap'), // two future beneficiaries trade rounds — « begging the turn »
  v.literal('remove') // exited/deceased/removed member's future round dropped; later rounds shift earlier
);

export const overrideOutcomeValidator = v.union(
  v.literal('confirmed'),
  v.literal('cancelled')
);

export const subscriptionStatusValidator = v.union(
  v.literal('paid'),
  v.literal('refunded')
);

export const pushPlatformValidator = v.union(
  v.literal('web'),
  v.literal('android'),
  v.literal('ios')
);

// ─────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    // Clerk-owned identifiers, mirrored via the svix webhook so member
    // search / email notify never need a Clerk API round-trip. Uniqueness
    // is Clerk's (per-instance); never written from client input.
    username: v.optional(v.string()), // lowercase, unique app-wide
    email: v.optional(v.string()),
    phone: v.optional(v.string()), // E.164, e.g. '+2376XXXXXXXX'; unique (mutation-enforced)
    language: appLanguageValidator, // default 'fr'
    avatarUrl: v.optional(v.string()),
    isDeactivated: v.optional(v.boolean()),
    pushTokens: v.optional(
      v.array(
        v.object({
          token: v.string(),
          platform: pushPlatformValidator,
          updatedAt: v.number(),
        })
      )
    ),
  })
    .index('by_clerk_id', ['clerkId'])
    .index('by_phone', ['phone'])
    .index('by_username', ['username']),

  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    city: v.optional(v.string()), // 'Douala' | 'Yaoundé' | 'Buea' | free text — pilot analytics only
    schedule: scheduleValidator,
    meetingDayOfWeek: v.optional(v.number()), // 0–6 (Sun–Sat); required for weekly/biweekly (mutation-enforced)
    meetingTime: v.optional(v.string()), // 'HH:mm', Africa/Douala — drives dueAt + D-1/D-0 meeting reminders (03 §E)
    contributionAmount: v.number(), // int XAF per member per round (current setting; cycles snapshot it)
    graceDays: v.number(), // GRACE_DAYS — default 2, president-configurable 0–7. The ONLY group-configurable timer (02 DECISION)
    finesEnabled: v.boolean(), // fine policy (02 §f); editable only in setup/between_cycles
    lateFineAmount: v.optional(v.number()), // flat XAF per offense — default for system fine proposals + one-tap manual fines
    beneficiaryContributes: v.boolean(), // default true; false ⇒ beneficiary owes nothing in their own round; snapshotted onto cycle
    collectionMode: collectionModeValidator, // default 'via_treasurer'; snapshotted onto cycle
    inviteCode: v.string(), // 6 chars, uppercase, alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0/O/1/I) — per 02
    status: groupStatusValidator,
    language: v.optional(appLanguageValidator), // group-level SMS/receipt language; default 'fr'
    createdByUserId: v.id('users'),
    premiumUntil: v.optional(v.number()), // denormalized cache of subscriptions — billing is L5; see §3.1
  }).index('by_invite_code', ['inviteCode']),

  memberships: defineTable({
    groupId: v.id('groups'),
    userId: v.optional(v.id('users')), // absent ⇒ feature-phone member (02/05's hasAccount:false)
    phone: v.optional(v.string()), // E.164; REQUIRED when userId absent (mutation-enforced)
    displayName: v.string(), // always present — roster renders without joining users
    role: membershipRoleValidator,
    status: membershipStatusValidator,
    joinedMidCycle: v.optional(v.boolean()), // approved while a cycle is active — no rounds/obligations until next cycle (02 edge case 4)
    joinedAt: v.number(),
    exitedAt: v.optional(v.number()), // set when status becomes exited/deceased
    mutedNotifications: v.optional(v.boolean()), // per-group mute, overrides user prefs
  })
    .index('by_group', ['groupId'])
    .index('by_user', ['userId'])
    .index('by_group_and_user', ['groupId', 'userId'])
    .index('by_phone', ['phone']),

  cycles: defineTable({
    groupId: v.id('groups'),
    index: v.number(), // 1-based, sequential per group
    status: cycleStatusValidator,
    rotationOrder: v.array(v.id('memberships')), // locked + public at activation; post-lock changes ONLY via orderChanges (I-4)
    contributionAmount: v.number(), // snapshot of groups.contributionAmount at lock
    schedule: scheduleValidator, // snapshot at lock
    beneficiaryContributes: v.boolean(), // snapshot at lock
    collectionMode: collectionModeValidator, // snapshot at lock
    graceDays: v.number(), // snapshot at lock — graceEndAt = dueAt + graceDays is materialized per round at cycle lock (02 §a/§b); editing groups.graceDays mid-cycle must never rewrite history
    startDate: v.string(), // YYYY-MM-DD — date of round 1's réunion
    lockedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_group', ['groupId'])
    .index('by_group_and_status', ['groupId', 'status']),

  rounds: defineTable({
    cycleId: v.id('cycles'),
    groupId: v.id('groups'), // denormalized — group-scoped queries skip the cycle hop
    index: v.number(), // 1-based within cycle; beneficiary = the orderChanges-adjusted rotation (I-4)
    beneficiaryMembershipId: v.id('memberships'),
    scheduledOpenAt: v.number(), // start of the period — members can pay any time during it (02 §b)
    dueAt: v.number(), // réunion date/time; on-time cutoff. Editable on scheduled/open rounds — see notes
    graceEndAt: v.number(), // dueAt + group.graceDays; recomputed if dueAt is edited
    status: roundStatusValidator,
    expectedAmountPerMember: v.number(), // snapshot from cycle at generation
    obligationStatuses: v.optional(
      v.array(
        v.object({
          membershipId: v.id('memberships'),
          status: obligationStatusValidator,
        })
      )
    ), // written EXACTLY ONCE, at close (02 §b closing rule 1) — frozen forever
    openedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_cycle', ['cycleId'])
    .index('by_group_and_status', ['groupId', 'status'])
    .index('by_status_and_due_at', ['status', 'dueAt'])
    .index('by_beneficiary', ['beneficiaryMembershipId']),

  paymentRecords: defineTable({
    groupId: v.id('groups'),
    roundId: v.optional(v.id('rounds')), // required for contribution/payout (mutation-enforced); optional for fine/assistance
    kind: paymentKindValidator,
    state: paymentStateValidator,
    method: v.optional(paymentMethodValidator), // absent on system pre-created `pending` rows (02 §b round-open pre-creation: the obligation exists before anyone knows how the money will move); set at claim
    amount: v.number(), // int XAF > 0; prefilled with the expected amount, EDITABLE at claim — partial/over amounts are normal (02 §e7)
    payerMembershipId: v.id('memberships'),
    payeeMembershipId: v.id('memberships'),
    claimedBySide: v.optional(paymentSideValidator), // 02's name. 'payer' = self-claim; 'payee' = Meeting Mode / « j'ai reçu ». Absent until claimed.
    recordedByMembershipId: v.optional(v.id('memberships')), // whose finger touched the screen; absent on system-created pending rows
    idempotencyKey: v.optional(v.string()), // client-generated UUID — REQUIRED on every client-originated insert/claim (mutation-enforced); replays no-op
    isArrears: v.optional(v.boolean()), // pending obligation that survived round close — claimable indefinitely (02 §b closing rule 2)
    proofType: proofTypeValidator,
    momoTxnId: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id('_storage')),
    note: v.optional(v.string()),
    fineId: v.optional(v.id('fines')), // required iff kind='fine'. This IS 02's `fineProposalId` — proposal and obligation are one fines row
    assistanceLevyId: v.optional(v.id('assistanceLevies')), // required iff kind='assistance'
    claimedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()), // denormalized from confirmations for cheap reads
    disputedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    reminder1SentAt: v.optional(v.number()), // T_CONFIRM_REMIND_1 fired (02 §c row 14) — keeps the 15-min tick idempotent
    reminder2SentAt: v.optional(v.number()), // T_CONFIRM_REMIND_2 fired (02 §c row 14)
  })
    .index('by_round', ['roundId'])
    .index('by_round_and_kind', ['roundId', 'kind'])
    .index('by_group', ['groupId'])
    .index('by_group_and_state', ['groupId', 'state'])
    .index('by_payer', ['payerMembershipId'])
    .index('by_payer_and_state', ['payerMembershipId', 'state'])
    .index('by_payee', ['payeeMembershipId'])
    .index('by_payee_and_state', ['payeeMembershipId', 'state'])
    .index('by_state_and_claimed_at', ['state', 'claimedAt'])
    .index('by_idempotency_key', ['idempotencyKey'])
    .index('by_fine', ['fineId'])
    .index('by_assistance_levy', ['assistanceLevyId']),

  confirmations: defineTable({
    paymentRecordId: v.id('paymentRecords'),
    groupId: v.id('groups'), // denormalized for group audit views
    membershipId: v.id('memberships'), // who acknowledged (the president on on-behalf confirms)
    onBehalfOfMembershipId: v.optional(v.id('memberships')), // set when the president confirms for a feature-phone party — feed-labeled « attesté »
    side: paymentSideValidator, // which side of the record the confirmation speaks for
    channel: confirmationChannelValidator,
    note: v.optional(v.string()),
  })
    .index('by_payment_record', ['paymentRecordId'])
    .index('by_membership', ['membershipId']),

  disputes: defineTable({
    paymentRecordId: v.id('paymentRecords'),
    groupId: v.id('groups'),
    openedByMembershipId: v.optional(v.id('memberships')), // absent ⇒ auto-opened
    autoOpened: v.boolean(), // true when cron opened it (T_AUTO_DISPUTE on a payer-side claim)
    reason: v.optional(disputeReasonValidator), // REQUIRED when member-opened (mutation-enforced); absent on auto-opened
    reasonNote: v.optional(v.string()), // free text accompanying the reason
    status: disputeStatusValidator,
    resolvedByMembershipId: v.optional(v.id('memberships')), // the acting party (payee late-confirm / payer withdraw) or the PRESIDENT (override) — never the treasurer
    resolutionNote: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_payment_record', ['paymentRecordId'])
    .index('by_group_and_status', ['groupId', 'status']),

  fines: defineTable({
    groupId: v.id('groups'),
    membershipId: v.id('memberships'), // who owes
    roundId: v.optional(v.id('rounds')), // set for round-linked fines (late/partial/unpaid)
    reason: fineReasonValidator,
    reasonNote: v.optional(v.string()),
    amount: v.number(), // int XAF — proposal default = groups.lateFineAmount; president may edit at confirm
    status: fineStatusValidator,
    issuedByMembershipId: v.optional(v.id('memberships')), // manual fines: treasurer/president; ABSENT ⇒ system-proposed at round close
    decidedByMembershipId: v.optional(v.id('memberships')), // president who confirmed / dismissed / waived
    resolvedAt: v.optional(v.number()), // paid / waived / dismissed / cancelled timestamp
  })
    .index('by_group_and_status', ['groupId', 'status'])
    .index('by_membership', ['membershipId'])
    .index('by_round', ['roundId']),

  assistanceLevies: defineTable({
    groupId: v.id('groups'),
    reason: assistanceReasonValidator,
    label: v.string(), // shown in feed, e.g. « Deuil — maman de Marie »
    amountPerMember: v.number(), // int XAF
    beneficiaryMembershipId: v.optional(v.id('memberships')), // optional: beneficiary may be external (a family)
    dueDate: v.optional(v.string()), // YYYY-MM-DD
    status: assistanceLevyStatusValidator,
    createdByMembershipId: v.id('memberships'),
    closedAt: v.optional(v.number()),
  }).index('by_group_and_status', ['groupId', 'status']),

  orderChanges: defineTable({
    cycleId: v.id('cycles'),
    groupId: v.id('groups'),
    kind: orderChangeKindValidator,
    membershipIds: v.array(v.id('memberships')), // swap: the two beneficiaries; remove: the departing member
    roundIndexes: v.array(v.number()), // affected future round indexes (pre-change numbering)
    presidentMembershipId: v.id('memberships'),
    note: v.string(), // MANDATORY — « begging the turn », deuil, exit, default-removal…
  })
    .index('by_cycle', ['cycleId'])
    .index('by_group', ['groupId']),

  presidentOverrides: defineTable({
    paymentRecordId: v.id('paymentRecords'),
    groupId: v.id('groups'),
    outcome: overrideOutcomeValidator, // disputed → confirmed|cancelled, or confirmed → cancelled
    note: v.string(), // MANDATORY, ≥ 10 chars (mutation-enforced) — the override is itself a ledger artifact
    presidentMembershipId: v.id('memberships'),
  })
    .index('by_payment_record', ['paymentRecordId'])
    .index('by_group', ['groupId']),

  activityEvents: defineTable({
    groupId: v.id('groups'),
    kind: v.string(), // 'transition' | 'phone_changed' | 'role_reassigned' | 'order_change' | 'president_override' | 'due_date_changed' | 'member_approved' | …
    entityTable: v.string(),
    entityId: v.string(),
    fromState: v.optional(v.string()), // set on kind='transition'
    toState: v.optional(v.string()),
    actorMembershipId: v.optional(v.id('memberships')), // absent ⇒ system
    note: v.optional(v.string()),
  })
    .index('by_group', ['groupId'])
    .index('by_group_and_kind', ['groupId', 'kind'])
    .index('by_entity', ['entityTable', 'entityId']),

  reliabilityStats: defineTable({
    userId: v.optional(v.id('users')),
    phone: v.optional(v.string()), // identity key for feature-phone members until signup; merged then
    onTimeCount: v.number(),
    lateCount: v.number(),
    unpaidRoundCount: v.number(), // round closed with frozen status unpaid/partial — the cardinal njangi sin
    postPayoutDefaultCount: v.number(), // unpaid/partial AFTER having received the pot — the heaviest penalty (02 §e3)
    disputedCount: v.number(), // payer-side claims adjudicated false (resolved_cancelled)
    totalConfirmedAmount: v.number(), // lifetime confirmed contribution XAF — display only, not in score
    lastEventAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_phone', ['phone']),

  notificationPreferences: defineTable({
    userId: v.id('users'),
    pushEnabled: v.boolean(), // default true
    smsEnabled: v.boolean(), // default false (SMS to members is a premium group feature — L6)
    reminderLeadDays: v.number(), // default 2 — days before round.dueAt
  }).index('by_user', ['userId']),

  // ── Auth (WhatsApp OTP + device-bind; docs/auth-whatsapp-otp-devicebind-spec.md) ──

  otpChallenges: defineTable({
    phone: v.string(), // E.164, normalizePhone() before insert/lookup
    purpose: v.union(
      v.literal('login'),
      v.literal('device_register'),
      v.literal('phone_change')
    ),
    // 'dev' generates/stores the code locally (hash below); 'twilio' delegates
    // code custody to Twilio Verify and keeps only the verification SID.
    provider: v.union(v.literal('twilio'), v.literal('dev')),
    codeHash: v.optional(v.string()), // SHA-256(salt + code) — dev provider only; plaintext NEVER stored
    salt: v.optional(v.string()),
    providerRef: v.optional(v.string()), // Twilio verification SID
    attemptsRemaining: v.number(), // starts 5, burned at 0
    sendCount: v.number(), // resends within the current UTC day
    lastSentAt: v.number(), // drives the 60s per-phone cooldown
    expiresAt: v.number(), // lastSentAt + 5 min
    consumedAt: v.optional(v.number()), // set on success — THE fresh-possession proof
    requestDeviceId: v.optional(v.string()), // client-supplied, per-device throttle
  })
    .index('by_phone_and_purpose', ['phone', 'purpose'])
    .index('by_expires_at', ['expiresAt']),

  devices: defineTable({
    userId: v.id('users'),
    clerkUserId: v.string(), // captured at registration so deviceLogin needs no JWT
    phone: v.string(), // denormalized E.164 at bind time → revoke-all-for-phone
    deviceId: v.string(), // opaque UUID from secure-store
    secretHash: v.string(), // SHA-256(salt + 256-bit secret). SAFETY: salted SHA-256 is
    // sufficient ONLY because the secret is high-entropy random — NEVER a user PIN.
    salt: v.string(),
    platform: pushPlatformValidator,
    label: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()), // SIM-swap / lost-phone kill switch
    failedAttempts: v.optional(v.number()), // deviceLogin rate limit
    lockedUntil: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_device_id', ['deviceId'])
    .index('by_phone', ['phone']),

  // Global daily counters (OTP send budget circuit-breaker, T-07).
  dailyCounters: defineTable({
    key: v.string(), // e.g. 'otp-send-2026-07-01'
    count: v.number(),
  }).index('by_key', ['key']),

  ussdContent: defineTable({
    method: paymentMethodValidator, // momo_mtn / orange_money
    language: appLanguageValidator,
    version: v.number(), // bump to update instructions without an app release (05 R3)
    title: v.string(),
    steps: v.array(v.string()),
  }).index('by_method_and_language', ['method', 'language']),

  subscriptions: defineTable({
    groupId: v.id('groups'),
    paidByUserId: v.id('users'), // the treasurer/champion
    provider: v.literal('campay'), // ONLY money the app ever touches — its own fee, as merchant
    providerTxnRef: v.string(), // webhook idempotency key
    amount: v.number(), // int XAF actually charged
    periodStart: v.number(),
    periodEnd: v.number(),
    status: subscriptionStatusValidator,
  })
    .index('by_group', ['groupId'])
    .index('by_provider_txn_ref', ['providerTxnRef']),
});
