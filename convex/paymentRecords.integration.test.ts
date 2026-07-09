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
      groupId,
      payerMembershipId,
      treasurerMembershipId,
      roundId,
      paymentRecordId,
    };
  });
  return { t, ...seeded };
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
});
