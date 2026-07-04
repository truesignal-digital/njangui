import { cronJobs } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import {
  autoDisputeFiresAt,
  DAY_MS,
  T_AUTO_CONFIRM,
  T_CONFIRM_REMIND_1,
  T_CONFIRM_REMIND_2,
} from './lib/paymentStateMachine';
import { applyAutoConfirm, applyAutoDispute } from './paymentRecords';
import { notifyMemberships } from './push';
import {
  closeRoundForTick,
  loadActiveRoundContext,
  openRoundForTick,
} from './rounds';
import { logActivityEvent } from './utils/activity';
import { paymentLink } from './lib/appLinks';

// ============================================================================
// THE cron — one tick every 15 minutes evaluating 02's global timer table
// (a daily cron would stretch the 48h T_AUTO_CONFIRM objection window
// unpredictably toward ~72h, 05 Week 2). The tick is idempotent and
// batch-safe: every scan is an indexed range (rounds.by_status_and_due_at,
// paymentRecords.by_state_and_claimed_at), never a full table walk; a
// backlog beyond one batch simply drains over the next ticks.
// ============================================================================

// At njangi scale (≤ 40 members, a handful of pilot groups) each batch is
// generous headroom; the 15-minute cadence drains any backlog quickly.
const ROUND_BATCH = 50;
const RECORD_BATCH = 100;
// Transaction-size bound on the claimed-record sweep (pages × RECORD_BATCH
// rows, each with ≤ 3 extra reads) — overflow drains on the next tick.
const MAX_RECORD_PAGES = 10;

// Upper bound on one schedule period (monthly, plus slack). `scheduledOpenAt`
// is always within one period of `dueAt` (02 §b), so scheduled rounds due
// inside this window are exactly the candidates that may need opening —
// keeps the scheduled-rounds scan a bounded index range (01 §3.1 rounds).
const MAX_PERIOD_MS = 32 * DAY_MS;

export const tick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    // ── 1. scheduled → open at scheduledOpenAt (02 §b opening rules) ──
    const openable = await ctx.db
      .query('rounds')
      .withIndex('by_status_and_due_at', (q) =>
        q.eq('status', 'scheduled').lte('dueAt', now + MAX_PERIOD_MS)
      )
      .take(ROUND_BATCH);
    for (const round of openable) {
      if (round.scheduledOpenAt > now) {
        continue;
      }
      await openRoundForTick(ctx, round._id); // ghost guard + idempotency inside
    }

    // ── 2. open → grace at dueAt (02 §b diagram) ──
    const graceable = await ctx.db
      .query('rounds')
      .withIndex('by_status_and_due_at', (q) =>
        q.eq('status', 'open').lte('dueAt', now)
      )
      .take(ROUND_BATCH);
    for (const round of graceable) {
      const context = await loadActiveRoundContext(ctx, round); // paused groups freeze round timers (02 §a)
      if (!context) {
        continue;
      }
      await ctx.db.patch(round._id, { status: 'grace' });
      await logActivityEvent(ctx, {
        groupId: round.groupId,
        kind: 'round_grace',
        entityTable: 'rounds',
        entityId: round._id,
        fromState: 'open',
        toState: 'grace',
      });
    }

    // ── 3. grace → closed at graceEndAt — SYSTEM-driven, no human gate
    // (02 §b closing rules; early when every contribution is terminal).
    // closeRoundForTick owns the graceEndAt / all-terminal decision.
    const closable = await ctx.db
      .query('rounds')
      .withIndex('by_status_and_due_at', (q) =>
        q.eq('status', 'grace').lte('dueAt', now)
      )
      .take(ROUND_BATCH);
    for (const round of closable) {
      await closeRoundForTick(ctx, round._id);
    }

    // ── 4. claimed-record timers (02 §c rows 5, 7, 14) ──
    // Record-level timers keep running even while a group is paused
    // (02 §a: money already claimed must still be acknowledged); only
    // `archived` groups are frozen. The T_CONFIRM_REMIND_1 cutoff is the
    // earliest timer, so this one range covers every case below.
    //
    // Cursor-paginated full sweep — NOT a fixed take(N) of the oldest rows:
    // anchored payer-side claims (réunion weeks away) and archived-group
    // leftovers legitimately stay 'claimed' in this range for weeks, so a
    // fixed head-of-range batch would eventually pin on them and starve
    // newer claims (auto-confirm/auto-dispute silently stop). The cursor
    // walks claimedAt forward so every row is visited each tick.
    const claimedCutoff = now - T_CONFIRM_REMIND_1;
    let claimedCursor = 0;
    for (let page = 0; page < MAX_RECORD_PAGES; page++) {
      const claimed = await ctx.db
        .query('paymentRecords')
        .withIndex('by_state_and_claimed_at', (q) =>
          q
            .eq('state', 'claimed')
            .gt('claimedAt', claimedCursor)
            .lte('claimedAt', claimedCutoff)
        )
        .take(RECORD_BATCH);
      if (claimed.length === 0) {
        break;
      }
      const lastClaimedAt = claimed[claimed.length - 1].claimedAt;
      for (const record of claimed) {
        if (
          record.claimedAt === undefined ||
          record.claimedBySide === undefined
        ) {
          continue; // data integrity — the machine would reject these anyway
        }
        if (record.payerMembershipId === record.payeeMembershipId) {
          continue; // self-records never carry timers (02 §c DECISION; row 14)
        }
        const group = await ctx.db.get(record.groupId);
        if (!group || group.status === 'archived') {
          continue;
        }
        const round =
          record.roundId !== undefined
            ? await ctx.db.get(record.roundId)
            : null;

        if (record.claimedBySide === 'payee') {
          // Row 5 — payee-side claim (Meeting Mode), silent payer auto-confirms
          // at T_AUTO_CONFIRM. Row 14 fires the 24h reminder before that;
          // the 48h reminder coincides with auto-confirm and never fires.
          if (record.claimedAt + T_AUTO_CONFIRM <= now) {
            await applyAutoConfirm(ctx, record);
          } else if (record.reminder1SentAt === undefined) {
            await ctx.db.patch(record._id, { reminder1SentAt: now });
            await logActivityEvent(ctx, {
              groupId: record.groupId,
              kind: 'confirm_reminder',
              entityTable: 'paymentRecords',
              entityId: record._id,
              note: 'T_CONFIRM_REMIND_1',
            });
            // Objection-window reminder → the PAYER (row 14): silence
            // auto-confirms at T_AUTO_CONFIRM.
            await notifyMemberships(ctx, [record.payerMembershipId], {
              titleFr: 'Rappel — confirmez',
              titleEn: 'Reminder — confirm',
              bodyFr: 'Un paiement enregistré pour vous attend votre confirmation',
              bodyEn: 'A payment recorded for you is awaiting your confirmation',
              url: paymentLink(record._id),
            });
          }
          continue;
        }

        // Payer-side claim — row 7: anchored auto-dispute, never before the
        // réunion: max(claimedAt + T_AUTO_DISPUTE, dueAt); payouts use
        // T_AUTO_DISPUTE_PAYOUT (7d). Private escalation, no feed broadcast.
        const firesAt = autoDisputeFiresAt({
          claimedAt: record.claimedAt,
          kind: record.kind,
          dueAt: round?.dueAt,
        });
        if (firesAt <= now) {
          await applyAutoDispute(ctx, record);
        } else if (
          record.claimedAt + T_CONFIRM_REMIND_2 <= now &&
          record.reminder2SentAt === undefined
        ) {
          // Row 14 copy: "Rappel: confirmez {amount} de {name}" → the payee.
          await ctx.db.patch(record._id, { reminder2SentAt: now });
          await logActivityEvent(ctx, {
            groupId: record.groupId,
            kind: 'confirm_reminder',
            entityTable: 'paymentRecords',
            entityId: record._id,
            note: 'T_CONFIRM_REMIND_2',
          });
          await notifyMemberships(ctx, [record.payeeMembershipId], {
            titleFr: 'Rappel — confirmez',
            titleEn: 'Reminder — confirm',
            bodyFr: 'Un paiement déclaré attend toujours votre confirmation',
            bodyEn: 'A declared payment is still awaiting your confirmation',
            url: paymentLink(record._id),
          });
        } else if (record.reminder1SentAt === undefined) {
          await ctx.db.patch(record._id, { reminder1SentAt: now });
          await logActivityEvent(ctx, {
            groupId: record.groupId,
            kind: 'confirm_reminder',
            entityTable: 'paymentRecords',
            entityId: record._id,
            note: 'T_CONFIRM_REMIND_1',
          });
          await notifyMemberships(ctx, [record.payeeMembershipId], {
            titleFr: 'Rappel — confirmez',
            titleEn: 'Reminder — confirm',
            bodyFr: 'Un paiement déclaré attend votre confirmation',
            bodyEn: 'A declared payment is awaiting your confirmation',
            url: paymentLink(record._id),
          });
        }
      }
      if (lastClaimedAt === undefined || claimed.length < RECORD_BATCH) {
        break; // undefined claimedAt sorts below the cursor — nothing newer follows
      }
      claimedCursor = lastClaimedAt;
    }

    // T_DISPUTE_STALE / T_PAYOUT_STALE weekly escalations (02 rows 15 + §d)
    // hang off this same tick once the Week 3 push pipeline exists — they
    // are pure notifications, no state transitions.

    return null;
  },
});

const crons = cronJobs();

// 02 "Global timer constants": ONE cron, every 15 minutes, evaluates every
// round and record timer. All constants live in convex/lib/paymentStateMachine.ts.
crons.interval(
  'lifecycle tick (02 timer table)',
  { minutes: 15 },
  internal.crons.tick,
  {}
);

export default crons;
