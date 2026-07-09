/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

async function seedGovernanceScenario() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const makeUser = (clerkId: string, name: string) =>
      ctx.db.insert('users', { clerkId, name, language: 'fr' });
    const presidentUserId = await makeUser('gov-president', 'Alice President');
    const memberAUserId = await makeUser('gov-member-a', 'Awa Member');
    const memberBUserId = await makeUser('gov-member-b', 'Benoit Member');
    const formerUserId = await makeUser('gov-former', 'Former Member');
    await makeUser('gov-outsider', 'Outside User');
    const groupId = await ctx.db.insert('groups', {
      name: 'Governance Njangi',
      schedule: 'monthly',
      contributionAmount: 10_000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'direct_to_beneficiary',
      inviteCode: 'GOV123',
      status: 'active',
      createdByUserId: presidentUserId,
    });
    const addMembership = (
      userId: typeof presidentUserId,
      displayName: string,
      role: 'president' | 'member',
      status: 'active' | 'exited',
      joinedAt: number
    ) =>
      ctx.db.insert('memberships', {
        groupId,
        userId,
        displayName,
        role,
        status,
        joinedAt,
        ...(status === 'exited' && { exitedAt: joinedAt + 100 }),
      });
    const presidentMembershipId = await addMembership(
      presidentUserId,
      'Alice President',
      'president',
      'active',
      1
    );
    const memberAMembershipId = await addMembership(
      memberAUserId,
      'Awa Member',
      'member',
      'active',
      2
    );
    const memberBMembershipId = await addMembership(
      memberBUserId,
      'Benoit Member',
      'member',
      'active',
      3
    );
    await addMembership(
      formerUserId,
      'Former Member',
      'member',
      'exited',
      4
    );
    const cycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'active',
      rotationOrder: [
        presidentMembershipId,
        memberAMembershipId,
        memberBMembershipId,
      ],
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'direct_to_beneficiary',
      graceDays: 2,
      startDate: '2026-07-10',
      lockedAt: 1,
    });
    const makeRound = (
      index: number,
      beneficiaryMembershipId: typeof presidentMembershipId,
      status: 'completed' | 'scheduled'
    ) =>
      ctx.db.insert('rounds', {
        cycleId,
        groupId,
        index,
        beneficiaryMembershipId,
        scheduledOpenAt: index * 1_000,
        dueAt: index * 2_000,
        graceEndAt: index * 3_000,
        status,
        expectedAmountPerMember: 10_000,
        ...(status === 'completed' && {
          openedAt: 1,
          closedAt: 2,
          completedAt: 3,
        }),
      });
    await makeRound(1, presidentMembershipId, 'completed');
    const round2Id = await makeRound(2, memberAMembershipId, 'scheduled');
    const round3Id = await makeRound(3, memberBMembershipId, 'scheduled');
    return {
      groupId,
      cycleId,
      presidentMembershipId,
      memberAMembershipId,
      memberBMembershipId,
      round2Id,
      round3Id,
    };
  });
  return { t, ...ids };
}

describe('governance integration', () => {
  test('president swaps future rounds with an immutable order-change artifact', async () => {
    const scenario = await seedGovernanceScenario();
    const president = scenario.t.withIdentity({ subject: 'gov-president' });

    const result = await president.mutation(api.cycles.recordOrderChange, {
      cycleId: scenario.cycleId,
      kind: 'swap',
      roundIndexes: [2, 3],
      note: 'Awa and Benoit agreed to exchange their future turns',
    });

    const evidence = await scenario.t.run(async (ctx) => ({
      round2: await ctx.db.get(scenario.round2Id),
      round3: await ctx.db.get(scenario.round3Id),
      orderChange: await ctx.db.get(result.orderChangeId),
    }));
    expect(evidence.round2?.beneficiaryMembershipId).toBe(
      scenario.memberBMembershipId
    );
    expect(evidence.round3?.beneficiaryMembershipId).toBe(
      scenario.memberAMembershipId
    );
    expect(evidence.orderChange).toMatchObject({
      kind: 'swap',
      roundIndexes: [2, 3],
      presidentMembershipId: scenario.presidentMembershipId,
    });
  });

  test('non-president cannot alter the rotation', async () => {
    const scenario = await seedGovernanceScenario();

    await expect(
      scenario.t.withIdentity({ subject: 'gov-member-a' }).mutation(
        api.cycles.recordOrderChange,
        {
          cycleId: scenario.cycleId,
          kind: 'swap',
          roundIndexes: [2, 3],
          note: 'Members cannot silently exchange their own turns',
        }
      )
    ).rejects.toThrow('Insufficient role');
  });

  test('former members retain read access while outsiders are denied', async () => {
    const scenario = await seedGovernanceScenario();

    const formerView = await scenario.t
      .withIdentity({ subject: 'gov-former' })
      .query(api.groups.getGroup, { groupId: scenario.groupId });
    expect(formerView).toMatchObject({
      name: 'Governance Njangi',
      viewerStatus: 'exited',
    });

    await expect(
      scenario.t
        .withIdentity({ subject: 'gov-outsider' })
        .query(api.groups.getGroup, { groupId: scenario.groupId })
    ).rejects.toThrow('Not a group member');
  });
});
