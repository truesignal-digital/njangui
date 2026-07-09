/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';

async function seedContributionScenario() {
  const t = convexTest({ schema, modules });
  const seeded = await t.run(async (ctx) => {
    const payerUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-payer',
      name: 'Paul Member',
      language: 'fr',
    });
    const treasurerUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-treasurer',
      name: 'Marie Treasurer',
      language: 'fr',
    });
    const outsiderUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-outsider',
      name: 'Outside User',
      language: 'en',
    });
    const presidentUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-president',
      name: 'Alice President',
      language: 'fr',
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Njangi Solidarité',
      schedule: 'monthly',
      contributionAmount: 10_000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode: 'TEST23',
      status: 'active',
      language: 'fr',
      createdByUserId: treasurerUserId,
    });
    const payerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: payerUserId,
      displayName: 'Paul Member',
      role: 'member',
      status: 'active',
      joinedAt: Date.now(),
    });
    const treasurerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: treasurerUserId,
      displayName: 'Marie Treasurer',
      role: 'treasurer',
      status: 'active',
      joinedAt: Date.now() + 1,
    });
    const presidentMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: presidentUserId,
      displayName: 'Alice President',
      role: 'president',
      status: 'active',
      joinedAt: Date.now() + 2,
    });
    const cycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'active',
      rotationOrder: [payerMembershipId, treasurerMembershipId],
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      graceDays: 2,
      startDate: '2026-07-10',
      lockedAt: Date.now(),
    });
    const roundId = await ctx.db.insert('rounds', {
      cycleId,
      groupId,
      index: 1,
      beneficiaryMembershipId: payerMembershipId,
      scheduledOpenAt: Date.now() - 1_000,
      dueAt: Date.now() + 86_400_000,
      graceEndAt: Date.now() + 3 * 86_400_000,
      status: 'open',
      expectedAmountPerMember: 10_000,
      openedAt: Date.now(),
    });
    const paymentRecordId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'contribution',
      state: 'pending',
      amount: 10_000,
      payerMembershipId,
      payeeMembershipId: treasurerMembershipId,
      proofType: 'none',
    });
    return {
      payerUserId,
      treasurerUserId,
      outsiderUserId,
      presidentUserId,
      groupId,
      payerMembershipId,
      treasurerMembershipId,
      presidentMembershipId,
      roundId,
      paymentRecordId,
    };
  });
  return { t, ...seeded };
}

async function seedCompletedPayoutScenario() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const presidentUserId = await ctx.db.insert('users', {
      clerkId: 'payout-president',
      name: 'Alice President',
      language: 'fr',
    });
    const treasurerUserId = await ctx.db.insert('users', {
      clerkId: 'payout-treasurer',
      name: 'Marie Treasurer',
      language: 'fr',
    });
    const beneficiaryUserId = await ctx.db.insert('users', {
      clerkId: 'payout-beneficiary',
      name: 'Paul Beneficiary',
      language: 'fr',
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Completed Njangi',
      schedule: 'monthly',
      contributionAmount: 10_000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode: 'PAY123',
      status: 'between_cycles',
      createdByUserId: presidentUserId,
    });
    const presidentMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: presidentUserId,
      displayName: 'Alice President',
      role: 'president',
      status: 'active',
      joinedAt: 1,
    });
    const treasurerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: treasurerUserId,
      displayName: 'Marie Treasurer',
      role: 'treasurer',
      status: 'active',
      joinedAt: 2,
    });
    const beneficiaryMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: beneficiaryUserId,
      displayName: 'Paul Beneficiary',
      role: 'member',
      status: 'active',
      joinedAt: 3,
    });
    const rotationOrder = [
      presidentMembershipId,
      treasurerMembershipId,
      beneficiaryMembershipId,
    ];
    const cycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'completed',
      rotationOrder,
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      graceDays: 2,
      startDate: '2026-07-10',
      lockedAt: 1,
      completedAt: 2,
    });
    const roundId = await ctx.db.insert('rounds', {
      cycleId,
      groupId,
      index: 3,
      beneficiaryMembershipId,
      scheduledOpenAt: 1,
      dueAt: 2,
      graceEndAt: 3,
      status: 'completed',
      expectedAmountPerMember: 10_000,
      openedAt: 1,
      closedAt: 2,
      completedAt: 3,
    });
    for (const payerMembershipId of rotationOrder) {
      await ctx.db.insert('paymentRecords', {
        groupId,
        roundId,
        kind: 'contribution',
        state: 'confirmed',
        method: 'cash',
        amount: 10_000,
        payerMembershipId,
        payeeMembershipId: treasurerMembershipId,
        claimedBySide: 'payer',
        recordedByMembershipId: payerMembershipId,
        proofType: 'none',
        claimedAt: 1,
        confirmedAt: 2,
      });
    }
    const payoutRecordId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'payout',
      state: 'confirmed',
      method: 'cash',
      amount: 30_000,
      payerMembershipId: treasurerMembershipId,
      payeeMembershipId: beneficiaryMembershipId,
      claimedBySide: 'payer',
      recordedByMembershipId: treasurerMembershipId,
      proofType: 'none',
      claimedAt: 2,
      confirmedAt: 3,
    });
    return { groupId, cycleId, roundId, payoutRecordId, treasurerMembershipId };
  });
  return { t, ...ids };
}

describe('payment record integration', () => {
  test('payer claim and treasurer confirmation produce one attributed ledger result', async () => {
    const { t, paymentRecordId, payerMembershipId, treasurerMembershipId } =
      await seedContributionScenario();
    const payer = t.withIdentity({ subject: 'clerk-payer' });
    const treasurer = t.withIdentity({ subject: 'clerk-treasurer' });

    const claimed = await payer.mutation(api.paymentRecords.claim, {
      paymentRecordId,
      idempotencyKey: 'round-1-paul-cash',
      method: 'cash',
    });
    expect(claimed.state).toBe('claimed');

    const confirmed = await treasurer.mutation(api.paymentRecords.confirm, {
      paymentRecordId,
      channel: 'meeting',
    });
    expect(confirmed.state).toBe('confirmed');

    const evidence = await t.run(async (ctx) => {
      const record = await ctx.db.get(paymentRecordId);
      const confirmations = await ctx.db
        .query('confirmations')
        .withIndex('by_payment_record', (q) => q.eq('paymentRecordId', paymentRecordId))
        .collect();
      const events = await ctx.db
        .query('activityEvents')
        .withIndex('by_entity', (q) =>
          q.eq('entityTable', 'paymentRecords').eq('entityId', paymentRecordId)
        )
        .collect();
      return { record, confirmations, events };
    });

    expect(evidence.record).toMatchObject({
      state: 'confirmed',
      claimedBySide: 'payer',
      recordedByMembershipId: payerMembershipId,
      method: 'cash',
    });
    expect(evidence.confirmations).toHaveLength(1);
    expect(evidence.confirmations[0]).toMatchObject({
      membershipId: treasurerMembershipId,
      side: 'payee',
      channel: 'meeting',
    });
    expect(evidence.events.map((event) => event.kind)).toEqual([
      'payment_claimed_by_payer',
      'payment_confirmed',
    ]);
  });

  test('replaying the same claim key is idempotent', async () => {
    const { t, paymentRecordId } = await seedContributionScenario();
    const payer = t.withIdentity({ subject: 'clerk-payer' });
    const args = {
      paymentRecordId,
      idempotencyKey: 'same-logical-tap',
      method: 'cash' as const,
    };

    const first = await payer.mutation(api.paymentRecords.claim, args);
    const replay = await payer.mutation(api.paymentRecords.claim, args);

    expect(replay).toEqual(first);
    const matching = await t.run(async (ctx) =>
      ctx.db
        .query('paymentRecords')
        .withIndex('by_idempotency_key', (q) =>
          q.eq('idempotencyKey', 'same-logical-tap')
        )
        .collect()
    );
    expect(matching).toHaveLength(1);
  });

  test('unauthenticated users and non-members cannot claim a group record', async () => {
    const { t, paymentRecordId } = await seedContributionScenario();
    const args = {
      paymentRecordId,
      idempotencyKey: 'unauthorized-tap',
      method: 'cash' as const,
    };

    await expect(t.mutation(api.paymentRecords.claim, args)).rejects.toThrow(
      'Not authenticated'
    );
    await expect(
      t.withIdentity({ subject: 'clerk-outsider' }).mutation(api.paymentRecords.claim, args)
    ).rejects.toThrow('Not a group member');
  });

  test('one idempotency key cannot be reused for a different record', async () => {
    const { t, paymentRecordId, groupId, roundId, payerMembershipId, treasurerMembershipId } =
      await seedContributionScenario();
    const secondRecordId: Id<'paymentRecords'> = await t.run((ctx) =>
      ctx.db.insert('paymentRecords', {
        groupId,
        roundId,
        kind: 'contribution',
        state: 'pending',
        amount: 5_000,
        payerMembershipId,
        payeeMembershipId: treasurerMembershipId,
        proofType: 'none',
      })
    );
    const payer = t.withIdentity({ subject: 'clerk-payer' });

    await payer.mutation(api.paymentRecords.claim, {
      paymentRecordId,
      idempotencyKey: 'unique-across-records',
      method: 'cash',
    });
    await expect(
      payer.mutation(api.paymentRecords.claim, {
        paymentRecordId: secondRecordId,
        idempotencyKey: 'unique-across-records',
        method: 'cash',
      })
    ).rejects.toThrow('Idempotency key already used for a different record');
  });

  test('president correction preserves confirmation history and recreates the obligation', async () => {
    const { t, paymentRecordId, roundId, presidentMembershipId } =
      await seedContributionScenario();
    const payer = t.withIdentity({ subject: 'clerk-payer' });
    const treasurer = t.withIdentity({ subject: 'clerk-treasurer' });
    const president = t.withIdentity({ subject: 'clerk-president' });

    await payer.mutation(api.paymentRecords.claim, {
      paymentRecordId,
      idempotencyKey: 'mistaken-entry',
      method: 'cash',
    });
    await treasurer.mutation(api.paymentRecords.confirm, {
      paymentRecordId,
      channel: 'meeting',
    });

    await expect(
      payer.mutation(api.paymentRecords.cancel, {
        paymentRecordId,
        note: 'I want to remove this',
      })
    ).rejects.toThrow('only the president');
    await expect(
      president.mutation(api.paymentRecords.cancel, {
        paymentRecordId,
        note: 'Too short',
      })
    ).rejects.toThrow('at least 10 characters');

    const corrected = await president.mutation(api.paymentRecords.cancel, {
      paymentRecordId,
      note: 'Duplicate entry recorded during the meeting',
    });
    expect(corrected.state).toBe('cancelled');
    await president.mutation(api.paymentRecords.cancel, {
      paymentRecordId,
      note: 'Duplicate entry recorded during the meeting',
    });

    const evidence = await t.run(async (ctx) => {
      const original = await ctx.db.get(paymentRecordId);
      const confirmations = await ctx.db
        .query('confirmations')
        .withIndex('by_payment_record', (q) => q.eq('paymentRecordId', paymentRecordId))
        .collect();
      const overrides = await ctx.db
        .query('presidentOverrides')
        .withIndex('by_payment_record', (q) => q.eq('paymentRecordId', paymentRecordId))
        .collect();
      const records = await ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', roundId).eq('kind', 'contribution')
        )
        .collect();
      return { original, confirmations, overrides, records };
    });

    expect(evidence.original).toMatchObject({
      state: 'cancelled',
      idempotencyKey: 'mistaken-entry',
    });
    expect(evidence.original?.confirmedAt).toBeTypeOf('number');
    expect(evidence.original?.cancelledAt).toBeTypeOf('number');
    expect(evidence.confirmations).toHaveLength(1);
    expect(evidence.overrides).toHaveLength(1);
    expect(evidence.overrides[0]).toMatchObject({
      outcome: 'cancelled',
      presidentMembershipId,
      note: 'Duplicate entry recorded during the meeting',
    });
    expect(evidence.records).toHaveLength(2);
    expect(evidence.records.find((record) => record.state === 'pending')).toMatchObject({
      amount: 10_000,
    });
  });

  test('correcting a final payout safely reopens the round and completed cycle', async () => {
    const scenario = await seedCompletedPayoutScenario();
    const president = scenario.t.withIdentity({ subject: 'payout-president' });

    await president.mutation(api.paymentRecords.cancel, {
      paymentRecordId: scenario.payoutRecordId,
      note: 'Beneficiary did not receive the recorded payout',
    });

    const evidence = await scenario.t.run(async (ctx) => {
      const payouts = await ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', scenario.roundId).eq('kind', 'payout')
        )
        .collect();
      return {
        group: await ctx.db.get(scenario.groupId),
        cycle: await ctx.db.get(scenario.cycleId),
        round: await ctx.db.get(scenario.roundId),
        payouts,
      };
    });

    expect(evidence.group?.status).toBe('active');
    expect(evidence.cycle).toMatchObject({ status: 'active' });
    expect(evidence.cycle?.completedAt).toBeUndefined();
    expect(evidence.round).toMatchObject({ status: 'payout' });
    expect(evidence.round?.completedAt).toBeUndefined();
    expect(evidence.payouts).toHaveLength(2);
    expect(evidence.payouts.find((record) => record.state === 'pending')).toMatchObject({
      amount: 30_000,
      payerMembershipId: scenario.treasurerMembershipId,
    });
  });

  test('refuses to reopen a payout once a later cycle exists', async () => {
    const scenario = await seedCompletedPayoutScenario();
    await scenario.t.run(async (ctx) => {
      await ctx.db.insert('cycles', {
        groupId: scenario.groupId,
        index: 2,
        status: 'draft',
        rotationOrder: [],
        contributionAmount: 10_000,
        schedule: 'monthly',
        beneficiaryContributes: true,
        collectionMode: 'via_treasurer',
        graceDays: 2,
        startDate: '2026-08-10',
      });
    });

    await expect(
      scenario.t.withIdentity({ subject: 'payout-president' }).mutation(
        api.paymentRecords.cancel,
        {
          paymentRecordId: scenario.payoutRecordId,
          note: 'Beneficiary did not receive the recorded payout',
        }
      )
    ).rejects.toThrow('after a later cycle has started');

    const unchanged = await scenario.t.run((ctx) =>
      ctx.db.get(scenario.payoutRecordId)
    );
    expect(unchanged?.state).toBe('confirmed');
  });

  test('partial wrong-amount dispute restores the exact outstanding obligation', async () => {
    const { t, paymentRecordId, roundId } = await seedContributionScenario();
    const payer = t.withIdentity({ subject: 'clerk-payer' });
    const treasurer = t.withIdentity({ subject: 'clerk-treasurer' });

    await payer.mutation(api.paymentRecords.claim, {
      paymentRecordId,
      idempotencyKey: 'partial-four-thousand',
      amount: 4_000,
      method: 'cash',
    });
    let records = await t.run((ctx) =>
      ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', roundId).eq('kind', 'contribution')
        )
        .collect()
    );
    expect(records.map((record) => [record.state, record.amount]).sort()).toEqual([
      ['claimed', 4_000],
      ['pending', 6_000],
    ]);

    await treasurer.mutation(api.paymentRecords.dispute, {
      paymentRecordId,
      reason: 'wrong_amount',
      note: 'Only the six-thousand balance was received',
    });
    await payer.mutation(api.paymentRecords.cancel, {
      paymentRecordId,
      note: 'Withdrawing the incorrect four-thousand claim',
    });

    records = await t.run((ctx) =>
      ctx.db
        .query('paymentRecords')
        .withIndex('by_round_and_kind', (q) =>
          q.eq('roundId', roundId).eq('kind', 'contribution')
        )
        .collect()
    );
    expect(records.filter((record) => record.state === 'cancelled')).toHaveLength(1);
    expect(
      records
        .filter((record) => record.state === 'pending')
        .map((record) => record.amount)
        .sort((a, b) => a - b)
    ).toEqual([4_000, 6_000]);
    expect(
      records
        .filter((record) => record.state !== 'cancelled')
        .reduce((sum, record) => sum + record.amount, 0)
    ).toBe(10_000);
  });
});
