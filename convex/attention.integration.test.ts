/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

async function seedLedgerAttentionScenario() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const viewerUserId = await ctx.db.insert('users', {
      clerkId: 'attention-viewer',
      name: 'Awa Member',
      language: 'fr',
    });
    const treasurerUserId = await ctx.db.insert('users', {
      clerkId: 'attention-treasurer',
      name: 'Marie Treasurer',
      language: 'fr',
    });
    const presidentUserId = await ctx.db.insert('users', {
      clerkId: 'attention-president',
      name: 'Paul President',
      language: 'fr',
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Attention Njangi',
      schedule: 'monthly',
      contributionAmount: 10_000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode: 'ATT123',
      status: 'active',
      language: 'fr',
      colorSeed: 120,
      createdByUserId: presidentUserId,
    });
    const viewerMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: viewerUserId,
      displayName: 'Awa Member',
      role: 'member',
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
    const presidentMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: presidentUserId,
      displayName: 'Paul President',
      role: 'president',
      status: 'active',
      joinedAt: 3,
    });
    const cycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'active',
      rotationOrder: [
        viewerMembershipId,
        treasurerMembershipId,
        presidentMembershipId,
      ],
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      graceDays: 2,
      startDate: '2026-07-10',
      lockedAt: 10,
    });
    const roundId = await ctx.db.insert('rounds', {
      cycleId,
      groupId,
      index: 1,
      beneficiaryMembershipId: viewerMembershipId,
      scheduledOpenAt: 1_000,
      dueAt: 10_000,
      graceEndAt: 20_000,
      status: 'open',
      expectedAmountPerMember: 10_000,
      openedAt: 1_000,
    });
    const pendingContributionId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'contribution',
      state: 'pending',
      amount: 10_000,
      payerMembershipId: viewerMembershipId,
      payeeMembershipId: treasurerMembershipId,
      proofType: 'none',
    });
    const claimedForViewerId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'contribution',
      state: 'claimed',
      method: 'cash',
      amount: 4_000,
      payerMembershipId: viewerMembershipId,
      payeeMembershipId: treasurerMembershipId,
      claimedBySide: 'payee',
      recordedByMembershipId: treasurerMembershipId,
      proofType: 'none',
      claimedAt: 2_000,
    });
    const waitingClaimId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'contribution',
      state: 'claimed',
      method: 'cash',
      amount: 3_000,
      payerMembershipId: viewerMembershipId,
      payeeMembershipId: treasurerMembershipId,
      claimedBySide: 'payer',
      recordedByMembershipId: viewerMembershipId,
      proofType: 'none',
      claimedAt: 3_000,
    });
    const disputedId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'contribution',
      state: 'disputed',
      method: 'cash',
      amount: 2_000,
      payerMembershipId: viewerMembershipId,
      payeeMembershipId: treasurerMembershipId,
      claimedBySide: 'payer',
      recordedByMembershipId: viewerMembershipId,
      proofType: 'none',
      claimedAt: 4_000,
      disputedAt: 5_000,
    });
    const pendingPayoutId = await ctx.db.insert('paymentRecords', {
      groupId,
      roundId,
      kind: 'payout',
      state: 'pending',
      amount: 30_000,
      payerMembershipId: treasurerMembershipId,
      payeeMembershipId: viewerMembershipId,
      proofType: 'none',
    });
    return {
      groupId,
      roundId,
      viewerMembershipId,
      treasurerMembershipId,
      pendingContributionId,
      claimedForViewerId,
      waitingClaimId,
      disputedId,
      pendingPayoutId,
    };
  });
  return { t, ...ids };
}

async function seedGovernanceAttentionScenario() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const presidentUserId = await ctx.db.insert('users', {
      clerkId: 'attention-gov-president',
      name: 'Alice President',
      language: 'fr',
    });
    const treasurerUserId = await ctx.db.insert('users', {
      clerkId: 'attention-gov-treasurer',
      name: 'Brigitte Treasurer',
      language: 'fr',
    });
    const memberUserId = await ctx.db.insert('users', {
      clerkId: 'attention-gov-member',
      name: 'Claude Member',
      language: 'fr',
    });
    const pendingUserId = await ctx.db.insert('users', {
      clerkId: 'attention-gov-pending',
      name: 'Diane Pending',
      language: 'fr',
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Governance Attention',
      schedule: 'monthly',
      contributionAmount: 10_000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode: 'GAT123',
      status: 'setup',
      language: 'fr',
      createdByUserId: treasurerUserId,
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
      displayName: 'Brigitte Treasurer',
      role: 'treasurer',
      status: 'active',
      joinedAt: 2,
    });
    const memberMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: memberUserId,
      displayName: 'Claude Member',
      role: 'member',
      status: 'active',
      joinedAt: 3,
    });
    const pendingMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: pendingUserId,
      displayName: 'Diane Pending',
      role: 'member',
      status: 'pending_approval',
      joinedAt: 4,
    });
    const draftCycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'draft',
      rotationOrder: [
        presidentMembershipId,
        treasurerMembershipId,
        memberMembershipId,
      ],
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      graceDays: 2,
      startDate: '',
    });
    return {
      groupId,
      treasurerUserId,
      draftCycleId,
      pendingMembershipId,
    };
  });
  return { t, ...ids };
}

describe('role-aware Attention projection', () => {
  test('separates executable work from waiting and orders trust work first', async () => {
    const scenario = await seedLedgerAttentionScenario();
    const viewer = scenario.t.withIdentity({ subject: 'attention-viewer' });

    const snapshot = await viewer.query(api.attention.readV1, {
      scope: { kind: 'viewer' },
    });

    expect(snapshot.actions.map((action) => action.kind)).toEqual([
      'resolve_dispute',
      'confirm_records',
      'record_payout_handover',
      'record_contribution',
    ]);
    expect(snapshot.actions[1]).toMatchObject({
      kind: 'confirm_records',
      recordCount: 1,
      totalAmount: 4_000,
    });
    expect(snapshot.waiting).toEqual([
      expect.objectContaining({
        kind: 'records_awaiting_confirmation',
        recordCount: 1,
        totalAmount: 3_000,
      }),
    ]);
    expect(snapshot.badgeCount).toBe(4);
    expect(snapshot.nextEvent).toMatchObject({
      group: { groupId: scenario.groupId },
      roundId: scenario.roundId,
      status: 'open',
    });
    expect(snapshot.truncated).toBe(false);
  });

  test('group scope is the same projection restricted to that Group', async () => {
    const scenario = await seedLedgerAttentionScenario();
    const viewer = scenario.t.withIdentity({ subject: 'attention-viewer' });

    const all = await viewer.query(api.attention.readV1, {
      scope: { kind: 'viewer' },
    });
    const group = await viewer.query(api.attention.readV1, {
      scope: { kind: 'group', groupId: scenario.groupId },
    });

    expect(group).toEqual(all);
  });

  test('Self-record stays a Claim action and never creates Confirm work', async () => {
    const scenario = await seedLedgerAttentionScenario();
    await scenario.t.run(async (ctx) => {
      await ctx.db.insert('paymentRecords', {
        groupId: scenario.groupId,
        roundId: scenario.roundId,
        kind: 'contribution',
        state: 'pending',
        amount: 10_000,
        payerMembershipId: scenario.treasurerMembershipId,
        payeeMembershipId: scenario.treasurerMembershipId,
        proofType: 'none',
      });
    });

    const snapshot = await scenario.t
      .withIdentity({ subject: 'attention-treasurer' })
      .query(api.attention.readV1, { scope: { kind: 'viewer' } });

    const contribution = snapshot.actions.find(
      (action) => action.kind === 'record_contribution'
    );
    const confirmations = snapshot.actions.find(
      (action) => action.kind === 'confirm_records'
    );
    expect(contribution).toMatchObject({
      kind: 'record_contribution',
      amount: 10_000,
      recordCount: 1,
    });
    expect(confirmations).toMatchObject({
      kind: 'confirm_records',
      recordCount: 1,
    });
  });

  test('grace Meeting Mode outranks ordinary Confirm work for the treasurer', async () => {
    const scenario = await seedLedgerAttentionScenario();
    await scenario.t.run(async (ctx) => {
      await ctx.db.patch(scenario.roundId, { status: 'grace' });
      await ctx.db.patch(scenario.disputedId, {
        state: 'cancelled',
        cancelledAt: 6_000,
      });
    });

    const snapshot = await scenario.t
      .withIdentity({ subject: 'attention-treasurer' })
      .query(api.attention.readV1, { scope: { kind: 'viewer' } });

    expect(snapshot.actions[0]).toMatchObject({
      kind: 'run_meeting',
      priority: 'blocking',
      roundStatus: 'grace',
    });
    expect(snapshot.actions.some((action) => action.kind === 'confirm_records')).toBe(
      true
    );
  });

  test('president gets Lock while treasurer gets a Waiting fact', async () => {
    const scenario = await seedGovernanceAttentionScenario();

    const president = await scenario.t
      .withIdentity({ subject: 'attention-gov-president' })
      .query(api.attention.readV1, { scope: { kind: 'viewer' } });
    expect(president.actions.map((action) => action.kind)).toEqual([
      'review_membership_requests',
      'lock_draft_cycle',
    ]);

    const treasurer = await scenario.t
      .withIdentity({ subject: 'attention-gov-treasurer' })
      .query(api.attention.readV1, { scope: { kind: 'viewer' } });
    expect(treasurer.actions.map((action) => action.kind)).toEqual([
      'review_membership_requests',
    ]);
    expect(treasurer.waiting).toEqual([
      expect.objectContaining({
        kind: 'cycle_awaiting_president',
        draftCycleId: scenario.draftCycleId,
      }),
    ]);
  });

  test('duplicate active Membership rows do not duplicate Group work', async () => {
    const scenario = await seedGovernanceAttentionScenario();
    await scenario.t.run(async (ctx) => {
      await ctx.db.insert('memberships', {
        groupId: scenario.groupId,
        userId: scenario.treasurerUserId,
        displayName: 'Brigitte duplicate',
        role: 'treasurer',
        status: 'active',
        joinedAt: 99,
      });
    });

    const snapshot = await scenario.t
      .withIdentity({ subject: 'attention-gov-treasurer' })
      .query(api.attention.readV1, { scope: { kind: 'viewer' } });
    expect(
      snapshot.actions.filter(
        (action) => action.kind === 'review_membership_requests'
      )
    ).toHaveLength(1);
    expect(
      snapshot.waiting.filter(
        (waiting) => waiting.kind === 'cycle_awaiting_president'
      )
    ).toHaveLength(1);
  });

  test('broken claimed state is explicit and never becomes an all-clear', async () => {
    const scenario = await seedLedgerAttentionScenario();
    await scenario.t.run(async (ctx) => {
      await ctx.db.patch(scenario.claimedForViewerId, {
        claimedBySide: undefined,
      });
    });

    await expect(
      scenario.t
        .withIdentity({ subject: 'attention-viewer' })
        .query(api.attention.readV1, { scope: { kind: 'viewer' } })
    ).rejects.toThrow('attention_unavailable');
  });
});
