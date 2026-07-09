/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

async function seedHandoverScenario() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const presidentUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-president',
      name: 'Alice President',
      language: 'fr',
    });
    const oldTreasurerUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-old-treasurer',
      name: 'Marie Old Treasurer',
      language: 'fr',
    });
    const newTreasurerUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-new-treasurer',
      name: 'Jeanne New Treasurer',
      language: 'fr',
    });
    const memberUserId = await ctx.db.insert('users', {
      clerkId: 'clerk-member',
      name: 'Paul Member',
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
      inviteCode: 'HAND23',
      status: 'active',
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
    const oldTreasurerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: oldTreasurerUserId,
      displayName: 'Marie Old Treasurer',
      role: 'treasurer',
      status: 'active',
      joinedAt: 2,
    });
    const newTreasurerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: newTreasurerUserId,
      displayName: 'Jeanne New Treasurer',
      role: 'member',
      status: 'active',
      joinedAt: 3,
    });
    const memberMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: memberUserId,
      displayName: 'Paul Member',
      role: 'member',
      status: 'active',
      joinedAt: 4,
    });

    const contribution = {
      groupId,
      kind: 'contribution' as const,
      amount: 10_000,
      payerMembershipId: memberMembershipId,
      payeeMembershipId: oldTreasurerMembershipId,
      proofType: 'none' as const,
    };
    const pendingContributionId = await ctx.db.insert('paymentRecords', {
      ...contribution,
      state: 'pending',
    });
    const claimedContributionId = await ctx.db.insert('paymentRecords', {
      ...contribution,
      state: 'claimed',
      method: 'cash',
      claimedBySide: 'payer',
      recordedByMembershipId: memberMembershipId,
      claimedAt: Date.now(),
    });
    const disputedContributionId = await ctx.db.insert('paymentRecords', {
      ...contribution,
      state: 'disputed',
      method: 'cash',
      claimedBySide: 'payer',
      recordedByMembershipId: memberMembershipId,
      claimedAt: Date.now(),
      disputedAt: Date.now(),
    });
    const confirmedContributionId = await ctx.db.insert('paymentRecords', {
      ...contribution,
      state: 'confirmed',
      method: 'cash',
      claimedBySide: 'payer',
      recordedByMembershipId: memberMembershipId,
      claimedAt: Date.now(),
      confirmedAt: Date.now(),
    });
    const pendingPayoutId = await ctx.db.insert('paymentRecords', {
      groupId,
      kind: 'payout',
      state: 'pending',
      amount: 40_000,
      payerMembershipId: oldTreasurerMembershipId,
      payeeMembershipId: memberMembershipId,
      proofType: 'none',
    });

    return {
      groupId,
      presidentMembershipId,
      oldTreasurerMembershipId,
      newTreasurerMembershipId,
      pendingContributionId,
      claimedContributionId,
      disputedContributionId,
      confirmedContributionId,
      pendingPayoutId,
    };
  });
  return { t, ...ids };
}

describe('treasurer handover integration', () => {
  test('moves only pending obligations to the new treasurer', async () => {
    const scenario = await seedHandoverScenario();
    const president = scenario.t.withIdentity({ subject: 'clerk-president' });

    await president.mutation(api.memberships.reassignTreasurer, {
      groupId: scenario.groupId,
      membershipId: scenario.newTreasurerMembershipId,
    });

    const result = await scenario.t.run(async (ctx) => ({
      oldTreasurer: await ctx.db.get(scenario.oldTreasurerMembershipId),
      newTreasurer: await ctx.db.get(scenario.newTreasurerMembershipId),
      pending: await ctx.db.get(scenario.pendingContributionId),
      claimed: await ctx.db.get(scenario.claimedContributionId),
      disputed: await ctx.db.get(scenario.disputedContributionId),
      confirmed: await ctx.db.get(scenario.confirmedContributionId),
      payout: await ctx.db.get(scenario.pendingPayoutId),
      events: await ctx.db
        .query('activityEvents')
        .withIndex('by_group', (q) => q.eq('groupId', scenario.groupId))
        .collect(),
    }));

    expect(result.oldTreasurer?.role).toBe('member');
    expect(result.newTreasurer?.role).toBe('treasurer');
    expect(result.pending?.payeeMembershipId).toBe(scenario.newTreasurerMembershipId);
    expect(result.claimed?.payeeMembershipId).toBe(scenario.oldTreasurerMembershipId);
    expect(result.disputed?.payeeMembershipId).toBe(scenario.oldTreasurerMembershipId);
    expect(result.confirmed?.payeeMembershipId).toBe(scenario.oldTreasurerMembershipId);
    expect(result.payout?.payerMembershipId).toBe(scenario.newTreasurerMembershipId);
    expect(result.events.at(-1)).toMatchObject({
      kind: 'role_reassigned',
      actorMembershipId: scenario.presidentMembershipId,
    });
  });

  test('rejects handover by a non-president without changing roles', async () => {
    const scenario = await seedHandoverScenario();

    await expect(
      scenario.t.withIdentity({ subject: 'clerk-member' }).mutation(
        api.memberships.reassignTreasurer,
        {
          groupId: scenario.groupId,
          membershipId: scenario.newTreasurerMembershipId,
        }
      )
    ).rejects.toThrow('Insufficient role');

    const roles = await scenario.t.run(async (ctx) => ({
      oldTreasurer: await ctx.db.get(scenario.oldTreasurerMembershipId),
      newTreasurer: await ctx.db.get(scenario.newTreasurerMembershipId),
    }));
    expect(roles.oldTreasurer?.role).toBe('treasurer');
    expect(roles.newTreasurer?.role).toBe('member');
  });
});
