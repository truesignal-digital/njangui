/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('mock pilot fixture', () => {
  beforeEach(() => {
    vi.stubEnv('DEV_SEED_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('creates the deterministic 15-member Njangi Solidarité draft', async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.dev.devSeedPilotData, {
      presidentClerkId: 'pilot-president',
      treasurerClerkId: 'pilot-treasurer',
      memberClerkId: 'pilot-member',
    });

    const fixture = await t.run(async (ctx) => {
      const group = await ctx.db.get(seeded.groupId);
      const cycle = await ctx.db.get(seeded.cycleId);
      const memberships = await ctx.db
        .query('memberships')
        .withIndex('by_group', (q) => q.eq('groupId', seeded.groupId))
        .collect();
      return { group, cycle, memberships };
    });

    expect(fixture.group).toMatchObject({
      name: 'Njangi Solidarité',
      city: 'Douala',
      schedule: 'monthly',
      contributionAmount: 10_000,
      targetMemberCount: 15,
      collectionMode: 'via_treasurer',
      status: 'setup',
      language: 'fr',
    });
    expect(fixture.memberships).toHaveLength(15);
    expect(fixture.memberships.filter((membership) => membership.userId)).toHaveLength(10);
    expect(fixture.memberships.filter((membership) => !membership.userId)).toHaveLength(5);
    expect(
      fixture.memberships.filter((membership) => membership.role === 'president')
    ).toHaveLength(1);
    expect(
      fixture.memberships.filter((membership) => membership.role === 'treasurer')
    ).toHaveLength(1);
    expect(fixture.cycle).toMatchObject({
      status: 'draft',
      contributionAmount: 10_000,
      schedule: 'monthly',
    });
    expect(fixture.cycle?.rotationOrder).toHaveLength(15);
    expect(new Set(fixture.cycle?.rotationOrder).size).toBe(15);
  });

  test('is unavailable when the deployment guard is off', async () => {
    vi.stubEnv('DEV_SEED_ENABLED', 'false');
    const t = convexTest({ schema, modules });

    await expect(
      t.mutation(internal.dev.devSeedPilotData, {
        presidentClerkId: 'pilot-president',
        treasurerClerkId: 'pilot-treasurer',
        memberClerkId: 'pilot-member',
      })
    ).rejects.toThrow('devSeed is disabled');
  });

  test('advances the fixture through production round transitions', async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.dev.devSeedPilotData, {
      presidentClerkId: 'pilot-president',
      treasurerClerkId: 'pilot-treasurer',
      memberClerkId: 'pilot-member',
    });
    const president = t.withIdentity({ subject: 'pilot-president' });

    const opened = await president.mutation(api.dev.devStartAndOpenRound, {
      groupId: seeded.groupId,
    });
    expect(opened.opened).toBe(true);

    const grace = await president.action(api.dev.devAdvancePilotRound, {
      groupId: seeded.groupId,
      step: 'to_grace',
    });
    expect(grace).toMatchObject({ roundIndex: 1, roundStatus: 'grace' });

    const closed = await president.action(api.dev.devAdvancePilotRound, {
      groupId: seeded.groupId,
      step: 'to_close',
    });
    expect(closed).toMatchObject({ roundIndex: 1, roundStatus: 'payout' });

    const evidence = await t.run(async (ctx) => {
      const records = await ctx.db
        .query('paymentRecords')
        .withIndex('by_round', (q) => q.eq('roundId', opened.roundId))
        .collect();
      const round = opened.roundId ? await ctx.db.get(opened.roundId) : null;
      return { records, round };
    });
    expect(evidence.records.filter((record) => record.kind === 'contribution')).toHaveLength(15);
    expect(evidence.records.filter((record) => record.kind === 'payout')).toHaveLength(1);
    expect(evidence.round?.obligationStatuses).toHaveLength(15);
  });
});
