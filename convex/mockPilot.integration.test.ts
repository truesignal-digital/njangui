/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('Njangi Solidarité mock pilot scenarios', () => {
  beforeEach(() => {
    vi.stubEnv('DEV_SEED_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('Round 1 — normal réunion reaches a confirmed payout with one record per obligation', async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.dev.devSeedPilotData, {
      presidentClerkId: 'pilot-president',
      treasurerClerkId: 'pilot-treasurer',
      memberClerkId: 'pilot-member',
    });
    const president = t.withIdentity({ subject: 'pilot-president' });
    const treasurer = t.withIdentity({ subject: 'pilot-treasurer' });
    const opened = await president.mutation(api.dev.devStartAndOpenRound, {
      groupId: seeded.groupId,
    });
    if (!opened.roundId) throw new Error('fixture did not open a round');

    const openedRecords = await t.run((ctx) =>
      ctx.db
        .query('paymentRecords')
        .withIndex('by_round', (q) => q.eq('roundId', opened.roundId!))
        .collect()
    );
    const contributions = openedRecords.filter(
      (record) => record.kind === 'contribution'
    );
    expect(contributions).toHaveLength(15);
    expect(openedRecords.filter((record) => record.kind === 'payout')).toHaveLength(1);

    // Meeting Mode: the treasurer records every received contribution. Their
    // own contribution follows the self-record path; the other fourteen use
    // payee-side claims and the normal silent objection window.
    for (const [index, record] of contributions.entries()) {
      await treasurer.mutation(api.paymentRecords.claim, {
        paymentRecordId: record._id,
        idempotencyKey: `pilot-round-1-${index}`,
        method: 'cash',
      });
    }
    await president.action(api.dev.devAdvancePilotRound, {
      groupId: seeded.groupId,
      step: 'expire_claims',
    });

    const afterObjectionWindow = await t.run((ctx) =>
      ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', opened.roundId!).eq('kind', 'contribution')
        )
        .collect()
    );
    expect(afterObjectionWindow).toHaveLength(15);
    expect(afterObjectionWindow.every((record) => record.state === 'confirmed')).toBe(
      true
    );

    const closed = await president.action(api.dev.devAdvancePilotRound, {
      groupId: seeded.groupId,
      step: 'to_close',
    });
    expect(closed.roundStatus).toBe('payout');

    const payout = await t.run(async (ctx) => {
      const records = await ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', opened.roundId!).eq('kind', 'payout')
        )
        .collect();
      return records[0];
    });
    await treasurer.mutation(api.paymentRecords.claim, {
      paymentRecordId: payout._id,
      idempotencyKey: 'pilot-round-1-payout',
      method: 'cash',
    });
    await president.mutation(api.paymentRecords.confirm, {
      paymentRecordId: payout._id,
      channel: 'meeting',
    });

    const final = await t.run(async (ctx) => ({
      round: await ctx.db.get(opened.roundId!),
      payout: await ctx.db.get(payout._id),
      records: await ctx.db
        .query('paymentRecords')
        .withIndex('by_round', (q) => q.eq('roundId', opened.roundId!))
        .collect(),
      events: await ctx.db
        .query('activityEvents')
        .withIndex('by_group', (q) => q.eq('groupId', seeded.groupId))
        .collect(),
    }));
    expect(final.round?.status).toBe('completed');
    expect(final.payout?.state).toBe('confirmed');
    expect(final.records).toHaveLength(16);
    expect(new Set(final.records.map((record) => record._id)).size).toBe(16);
    expect(final.events.map((event) => event.kind)).toContain('round_completed');
  });
});
