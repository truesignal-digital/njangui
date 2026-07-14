import { ConvexError, v, type Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import {
  compareAttentionActions,
  earliestTimestamp,
  stableAttentionId,
  type AttentionKind,
} from './lib/attention';
import { validateRotationOrder } from './lib/cycleMath';
import {
  paymentActorForMembership,
  representationContext,
  toPaymentRecordSnapshot,
} from './lib/paymentCapabilities';
import {
  T_AUTO_CONFIRM,
  autoDisputeFiresAt,
  canTransition,
  counterpartySideOf,
  isSelfRecord,
  membershipIdForSide,
} from './lib/paymentStateMachine';
import {
  membershipRoleValidator,
  paymentKindValidator,
  roundStatusValidator,
} from './schema';
import { getCurrentUserOrNull } from './utils/auth';

const MAX_VIEWER_MEMBERSHIPS = 100;
const MAX_GROUP_MEMBERSHIPS = 100;
const MAX_RECORDS_PER_STATE = 200;
const MAX_ROUNDS_PER_CYCLE = 50;
const MAX_ACTIONS = 100;
const MAX_WAITING_FACTS = 100;

const groupReferenceValidator = v.object({
  groupId: v.id('groups'),
  name: v.string(),
  colorSeed: v.union(v.number(), v.null()),
});

const capacityValidator = membershipRoleValidator;
const priorityValidator = v.union(
  v.literal('blocking'),
  v.literal('respond'),
  v.literal('operate'),
  v.literal('prepare')
);

const actionBase = {
  id: v.string(),
  group: groupReferenceValidator,
  capacity: capacityValidator,
  priority: priorityValidator,
  dueAt: v.union(v.number(), v.null()),
};

const attentionActionValidator = v.union(
  v.object({
    ...actionBase,
    kind: v.literal('resolve_dispute'),
    paymentRecordId: v.id('paymentRecords'),
    paymentKind: paymentKindValidator,
    amount: v.number(),
    payerName: v.string(),
    payeeName: v.string(),
    disputedAt: v.number(),
    destination: v.object({
      kind: v.literal('payment_record'),
      paymentRecordId: v.id('paymentRecords'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('confirm_records'),
    recordCount: v.number(),
    totalAmount: v.number(),
    earliestRespondByAt: v.number(),
    destination: v.object({
      kind: v.literal('confirmation_queue'),
      groupId: v.id('groups'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('run_meeting'),
    roundId: v.id('rounds'),
    roundIndex: v.number(),
    roundStatus: v.union(v.literal('open'), v.literal('grace')),
    beneficiaryName: v.string(),
    destination: v.object({
      kind: v.literal('meeting_mode'),
      groupId: v.id('groups'),
      roundId: v.id('rounds'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('record_payout_handover'),
    roundId: v.id('rounds'),
    paymentRecordId: v.id('paymentRecords'),
    beneficiaryName: v.string(),
    amount: v.number(),
    claimSide: v.union(v.literal('payer'), v.literal('payee')),
    destination: v.object({
      kind: v.literal('round'),
      groupId: v.id('groups'),
      roundId: v.id('rounds'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('confirm_payout_handover'),
    roundId: v.id('rounds'),
    paymentRecordId: v.id('paymentRecords'),
    beneficiaryName: v.string(),
    amount: v.number(),
    respondByAt: v.number(),
    destination: v.object({
      kind: v.literal('payment_record'),
      paymentRecordId: v.id('paymentRecords'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('record_contribution'),
    roundId: v.id('rounds'),
    recordCount: v.number(),
    amount: v.number(),
    isArrears: v.boolean(),
    destination: v.object({
      kind: v.literal('round_payment'),
      groupId: v.id('groups'),
      roundId: v.id('rounds'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('review_membership_requests'),
    pendingCount: v.number(),
    oldestRequestAt: v.number(),
    destination: v.object({
      kind: v.literal('member_requests'),
      groupId: v.id('groups'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('assign_president'),
    activeMemberCount: v.number(),
    destination: v.object({
      kind: v.literal('group_overview'),
      groupId: v.id('groups'),
    }),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('prepare_draft_cycle'),
    activeMemberCount: v.number(),
    draftCycleId: v.union(v.id('cycles'), v.null()),
    nextStep: v.union(
      v.literal('add_members'),
      v.literal('assign_treasurer'),
      v.literal('arrange_rotation')
    ),
    destination: v.union(
      v.object({
        kind: v.literal('group_overview'),
        groupId: v.id('groups'),
      }),
      v.object({
        kind: v.literal('draft_cycle'),
        groupId: v.id('groups'),
      })
    ),
  }),
  v.object({
    ...actionBase,
    kind: v.literal('lock_draft_cycle'),
    draftCycleId: v.id('cycles'),
    memberCount: v.number(),
    destination: v.object({
      kind: v.literal('draft_cycle'),
      groupId: v.id('groups'),
    }),
  })
);

const waitingFactValidator = v.union(
  v.object({
    id: v.string(),
    kind: v.literal('records_awaiting_confirmation'),
    group: groupReferenceValidator,
    recordCount: v.number(),
    totalAmount: v.number(),
    expectedByAt: v.union(v.number(), v.null()),
    destination: v.object({
      kind: v.literal('group_overview'),
      groupId: v.id('groups'),
    }),
  }),
  v.object({
    id: v.string(),
    kind: v.literal('membership_awaiting_approval'),
    group: groupReferenceValidator,
    membershipId: v.id('memberships'),
    requestedAt: v.number(),
    destination: v.null(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal('cycle_awaiting_president'),
    group: groupReferenceValidator,
    draftCycleId: v.id('cycles'),
    destination: v.object({
      kind: v.literal('group_overview'),
      groupId: v.id('groups'),
    }),
  })
);

const nextEventValidator = v.object({
  group: groupReferenceValidator,
  roundId: v.id('rounds'),
  roundIndex: v.number(),
  status: roundStatusValidator,
  beneficiaryName: v.string(),
  dueAt: v.number(),
});

const attentionSnapshotValidator = v.object({
  actions: v.array(attentionActionValidator),
  waiting: v.array(waitingFactValidator),
  nextEvent: v.union(nextEventValidator, v.null()),
  badgeCount: v.number(),
  truncated: v.boolean(),
});

type AttentionAction = Infer<typeof attentionActionValidator>;
type WaitingFact = Infer<typeof waitingFactValidator>;
type NextEvent = Infer<typeof nextEventValidator>;

type ActionCandidate = {
  action: AttentionAction;
  sourceCreatedAt: number;
};

type WaitingCandidate = {
  waiting: WaitingFact;
  expectedByAt: number | null;
  sourceCreatedAt: number;
};

function failAttention(reason: string): never {
  throw new ConvexError({ code: 'attention_unavailable', reason });
}

function groupReference(group: Doc<'groups'>) {
  return {
    groupId: group._id,
    name: group.name,
    colorSeed: group.colorSeed ?? null,
  };
}

function membershipStatusOrder(status: Doc<'memberships'>['status']): number {
  switch (status) {
    case 'active':
      return 0;
    case 'exited':
    case 'deceased':
      return 1;
    case 'pending_approval':
      return 2;
    case 'rejected':
      return 3;
  }
}

function canonicalViewerMemberships(
  memberships: Doc<'memberships'>[]
): Doc<'memberships'>[] {
  const byGroup = new Map<Id<'groups'>, Doc<'memberships'>[]>();
  for (const membership of memberships) {
    if (membership.status === 'rejected') continue;
    const rows = byGroup.get(membership.groupId) ?? [];
    rows.push(membership);
    byGroup.set(membership.groupId, rows);
  }

  return [...byGroup.values()].map((rows) =>
    rows.sort((left, right) => {
      const status =
        membershipStatusOrder(left.status) - membershipStatusOrder(right.status);
      return status !== 0
        ? status
        : left._creationTime - right._creationTime;
    })[0]
  );
}

/**
 * Historical phone-link flows can leave two Membership rows for one person.
 * Governance counts and Draft-cycle readiness must reason about people, not
 * aliases, while payment-party lookups still retain every raw Membership ID.
 */
function canonicalGroupMemberships(
  memberships: Doc<'memberships'>[]
): Doc<'memberships'>[] {
  const byPerson = new Map<string, Doc<'memberships'>[]>();
  for (const membership of memberships) {
    const personKey = membership.userId
      ? `user:${membership.userId}`
      : membership.phone
        ? `phone:${membership.phone}`
        : `membership:${membership._id}`;
    const rows = byPerson.get(personKey) ?? [];
    rows.push(membership);
    byPerson.set(personKey, rows);
  }
  return [...byPerson.values()].map((rows) =>
    rows.sort((left, right) => {
      const status =
        membershipStatusOrder(left.status) - membershipStatusOrder(right.status);
      return status !== 0
        ? status
        : left._creationTime - right._creationTime;
    })[0]
  );
}

async function responseDeadline(
  ctx: QueryCtx,
  record: Doc<'paymentRecords'>
): Promise<number> {
  if (record.claimedAt === undefined || record.claimedBySide === undefined) {
    failAttention('Claimed PaymentRecord is missing Claim timing metadata');
  }
  if (record.claimedBySide === 'payee') {
    return record.claimedAt + T_AUTO_CONFIRM;
  }
  const round =
    record.roundId === undefined ? null : await ctx.db.get(record.roundId);
  return autoDisputeFiresAt({
    claimedAt: record.claimedAt,
    kind: record.kind,
    ...(round ? { dueAt: round.dueAt } : {}),
  });
}

async function membershipName(
  ctx: QueryCtx,
  memberships: Map<Id<'memberships'>, Doc<'memberships'>>,
  membershipId: Id<'memberships'>
): Promise<string> {
  const cached = memberships.get(membershipId);
  if (cached) return cached.displayName;
  return (await ctx.db.get(membershipId))?.displayName ?? '—';
}

function actionKind(action: AttentionAction): AttentionKind {
  return action.kind;
}

/**
 * Viewer-relative live projection. Canonical rows remain authoritative; every
 * destination mutation revalidates state and capability after navigation.
 */
export const readV1 = query({
  args: {
    scope: v.union(
      v.object({ kind: v.literal('viewer') }),
      v.object({
        kind: v.literal('group'),
        groupId: v.id('groups'),
      })
    ),
  },
  returns: attentionSnapshotValidator,
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      throw new ConvexError({ code: 'attention_unauthenticated' });
    }

    let viewerMembershipRows: Doc<'memberships'>[];
    let truncated = false;
    if (args.scope.kind === 'group') {
      const groupId = args.scope.groupId;
      const rows = await ctx.db
        .query('memberships')
        .withIndex('by_group_and_user', (q) =>
          q.eq('groupId', groupId).eq('userId', auth.user._id)
        )
        .take(21);
      viewerMembershipRows = rows;
      truncated = rows.length > 20;
    } else {
      const [activeRows, pendingRows] = await Promise.all([
        ctx.db
          .query('memberships')
          .withIndex('by_user_and_status', (q) =>
            q.eq('userId', auth.user._id).eq('status', 'active')
          )
          .take(MAX_VIEWER_MEMBERSHIPS + 1),
        ctx.db
          .query('memberships')
          .withIndex('by_user_and_status', (q) =>
            q.eq('userId', auth.user._id).eq('status', 'pending_approval')
          )
          .take(MAX_VIEWER_MEMBERSHIPS + 1),
      ]);
      viewerMembershipRows = [
        ...activeRows.slice(0, MAX_VIEWER_MEMBERSHIPS),
        ...pendingRows.slice(0, MAX_VIEWER_MEMBERSHIPS),
      ];
      truncated =
        activeRows.length > MAX_VIEWER_MEMBERSHIPS ||
        pendingRows.length > MAX_VIEWER_MEMBERSHIPS;
    }

    let viewerMemberships = canonicalViewerMemberships(viewerMembershipRows);
    if (args.scope.kind === 'group') {
      const groupId = args.scope.groupId;
      viewerMemberships = viewerMemberships.filter(
        (membership) => membership.groupId === groupId
      );
      if (viewerMemberships.length === 0) {
        throw new ConvexError({ code: 'attention_not_found' });
      }
    }

    const actionCandidates: ActionCandidate[] = [];
    const waitingCandidates: WaitingCandidate[] = [];
    let nextEvent: NextEvent | null = null;

    for (const viewerMembership of viewerMemberships) {
      const group = await ctx.db.get(viewerMembership.groupId);
      if (!group) {
        failAttention('Membership references a missing Group');
      }
      const groupRef = groupReference(group);

      if (viewerMembership.status === 'pending_approval') {
        waitingCandidates.push({
          waiting: {
            id: stableAttentionId(
              'membership_awaiting_approval',
              group._id,
              viewerMembership._id
            ),
            kind: 'membership_awaiting_approval',
            group: groupRef,
            membershipId: viewerMembership._id,
            requestedAt: viewerMembership.joinedAt,
            destination: null,
          },
          expectedByAt: null,
          sourceCreatedAt: viewerMembership._creationTime,
        });
        continue;
      }
      if (
        viewerMembership.status !== 'active' ||
        group.status === 'archived'
      ) {
        continue;
      }

      const [activeGroupMemberships, pendingGroupMemberships] =
        await Promise.all([
          ctx.db
            .query('memberships')
            .withIndex('by_group_and_status', (q) =>
              q.eq('groupId', group._id).eq('status', 'active')
            )
            .take(MAX_GROUP_MEMBERSHIPS + 1),
          ctx.db
            .query('memberships')
            .withIndex('by_group_and_status', (q) =>
              q.eq('groupId', group._id).eq('status', 'pending_approval')
            )
            .take(MAX_GROUP_MEMBERSHIPS + 1),
        ]);
      if (
        activeGroupMemberships.length > MAX_GROUP_MEMBERSHIPS ||
        pendingGroupMemberships.length > MAX_GROUP_MEMBERSHIPS
      ) {
        truncated = true;
      }
      const groupMemberships = [
        ...activeGroupMemberships.slice(0, MAX_GROUP_MEMBERSHIPS),
        ...pendingGroupMemberships.slice(0, MAX_GROUP_MEMBERSHIPS),
      ];
      const canonicalMemberships = canonicalGroupMemberships(groupMemberships);
      const membershipById = new Map(
        groupMemberships.map((membership) => [membership._id, membership])
      );
      const actor = paymentActorForMembership(viewerMembership);

      const [pendingResult, claimedResult, disputedResult, activeCycle, draftCycle] =
        await Promise.all([
          ctx.db
            .query('paymentRecords')
            .withIndex('by_group_and_state', (q) =>
              q.eq('groupId', group._id).eq('state', 'pending')
            )
            .take(MAX_RECORDS_PER_STATE + 1),
          ctx.db
            .query('paymentRecords')
            .withIndex('by_group_and_state', (q) =>
              q.eq('groupId', group._id).eq('state', 'claimed')
            )
            .take(MAX_RECORDS_PER_STATE + 1),
          ctx.db
            .query('paymentRecords')
            .withIndex('by_group_and_state', (q) =>
              q.eq('groupId', group._id).eq('state', 'disputed')
            )
            .take(MAX_RECORDS_PER_STATE + 1),
          ctx.db
            .query('cycles')
            .withIndex('by_group_and_status', (q) =>
              q.eq('groupId', group._id).eq('status', 'active')
            )
            .first(),
          ctx.db
            .query('cycles')
            .withIndex('by_group_and_status', (q) =>
              q.eq('groupId', group._id).eq('status', 'draft')
            )
            .first(),
        ]);

      if (
        pendingResult.length > MAX_RECORDS_PER_STATE ||
        claimedResult.length > MAX_RECORDS_PER_STATE ||
        disputedResult.length > MAX_RECORDS_PER_STATE
      ) {
        truncated = true;
      }
      const pendingRecords = pendingResult.slice(0, MAX_RECORDS_PER_STATE);
      const claimedRecords = claimedResult.slice(0, MAX_RECORDS_PER_STATE);
      const disputedRecords = disputedResult.slice(0, MAX_RECORDS_PER_STATE);

      let confirmCount = 0;
      let confirmTotal = 0;
      let confirmDeadline: number | null = null;
      let confirmCreatedAt = Number.POSITIVE_INFINITY;
      let confirmCapacity: Doc<'memberships'>['role'] = 'member';

      let waitingCount = 0;
      let waitingTotal = 0;
      let waitingDeadline: number | null = null;
      let waitingCreatedAt = Number.POSITIVE_INFINITY;

      for (const record of claimedRecords) {
        const snapshot = toPaymentRecordSnapshot(record);
        const viewerIsParty =
          record.payerMembershipId === viewerMembership._id ||
          record.payeeMembershipId === viewerMembership._id;
        if (record.claimedBySide === undefined) {
          if (viewerIsParty || viewerMembership.role === 'president') {
            failAttention('Claimed PaymentRecord is missing claimedBySide');
          }
          continue;
        }

        const counterpartyId = membershipIdForSide(
          snapshot,
          counterpartySideOf(record.claimedBySide)
        ) as Id<'memberships'>;
        const counterparty =
          membershipById.get(counterpartyId) ??
          (await ctx.db.get(counterpartyId));
        const context = representationContext(counterparty);

        if (canTransition(snapshot, 'confirmed', actor, context)) {
          const deadline = await responseDeadline(ctx, record);
          if (record.kind === 'payout') {
            if (record.roundId === undefined) {
              failAttention('Payout PaymentRecord is missing its Round');
            }
            const round = await ctx.db.get(record.roundId);
            if (!round) failAttention('Payout references a missing Round');
            const beneficiaryName = await membershipName(
              ctx,
              membershipById,
              record.payeeMembershipId
            );
            actionCandidates.push({
              action: {
                id: stableAttentionId(
                  'confirm_payout_handover',
                  group._id,
                  record._id
                ),
                kind: 'confirm_payout_handover',
                group: groupRef,
                capacity:
                  viewerIsParty && viewerMembership._id === counterpartyId
                    ? 'member'
                    : 'president',
                priority: 'respond',
                dueAt: deadline,
                roundId: round._id,
                paymentRecordId: record._id,
                beneficiaryName,
                amount: record.amount,
                respondByAt: deadline,
                destination: {
                  kind: 'payment_record',
                  paymentRecordId: record._id,
                },
              },
              sourceCreatedAt: record._creationTime,
            });
          } else {
            confirmCount += 1;
            confirmTotal += record.amount;
            confirmDeadline = earliestTimestamp(confirmDeadline, deadline);
            confirmCreatedAt = Math.min(
              confirmCreatedAt,
              record._creationTime
            );
            if (!viewerIsParty) confirmCapacity = 'president';
          }
          continue;
        }

        const claimantId = membershipIdForSide(
          snapshot,
          record.claimedBySide
        ) as Id<'memberships'>;
        if (claimantId === viewerMembership._id) {
          const deadline = await responseDeadline(ctx, record);
          waitingCount += 1;
          waitingTotal += record.amount;
          waitingDeadline = earliestTimestamp(waitingDeadline, deadline);
          waitingCreatedAt = Math.min(
            waitingCreatedAt,
            record._creationTime
          );
        }
      }

      if (confirmCount > 0 && confirmDeadline !== null) {
        actionCandidates.push({
          action: {
            id: stableAttentionId('confirm_records', group._id, 'claimed'),
            kind: 'confirm_records',
            group: groupRef,
            capacity: confirmCapacity,
            priority: 'respond',
            dueAt: confirmDeadline,
            recordCount: confirmCount,
            totalAmount: confirmTotal,
            earliestRespondByAt: confirmDeadline,
            destination: {
              kind: 'confirmation_queue',
              groupId: group._id,
            },
          },
          sourceCreatedAt: confirmCreatedAt,
        });
      }

      if (waitingCount > 0) {
        waitingCandidates.push({
          waiting: {
            id: stableAttentionId(
              'records_awaiting_confirmation',
              group._id,
              'claimed'
            ),
            kind: 'records_awaiting_confirmation',
            group: groupRef,
            recordCount: waitingCount,
            totalAmount: waitingTotal,
            expectedByAt: waitingDeadline,
            destination: {
              kind: 'group_overview',
              groupId: group._id,
            },
          },
          expectedByAt: waitingDeadline,
          sourceCreatedAt: waitingCreatedAt,
        });
      }

      for (const record of disputedRecords) {
        const snapshot = toPaymentRecordSnapshot(record);
        const viewerIsParty =
          record.payerMembershipId === viewerMembership._id ||
          record.payeeMembershipId === viewerMembership._id;
        if (record.claimedBySide === undefined) {
          if (viewerIsParty || viewerMembership.role === 'president') {
            failAttention('Disputed PaymentRecord is missing claimedBySide');
          }
          continue;
        }
        if (
          !canTransition(snapshot, 'confirmed', actor) &&
          !canTransition(snapshot, 'cancelled', actor)
        ) {
          continue;
        }
        const [payerName, payeeName] = await Promise.all([
          membershipName(ctx, membershipById, record.payerMembershipId),
          membershipName(ctx, membershipById, record.payeeMembershipId),
        ]);
        actionCandidates.push({
          action: {
            id: stableAttentionId(
              'resolve_dispute',
              group._id,
              record._id
            ),
            kind: 'resolve_dispute',
            group: groupRef,
            capacity:
              viewerMembership.role === 'president'
                ? 'president'
                : 'member',
            priority: 'blocking',
            dueAt: null,
            paymentRecordId: record._id,
            paymentKind: record.kind,
            amount: record.amount,
            payerName,
            payeeName,
            disputedAt: record.disputedAt ?? record._creationTime,
            destination: {
              kind: 'payment_record',
              paymentRecordId: record._id,
            },
          },
          sourceCreatedAt: record._creationTime,
        });
      }

      const contributionsByRound = new Map<
        Id<'rounds'>,
        {
          round: Doc<'rounds'>;
          amount: number;
          recordCount: number;
          isArrears: boolean;
          sourceCreatedAt: number;
        }
      >();

      for (const record of pendingRecords) {
        const snapshot = toPaymentRecordSnapshot(record);
        const targetState = isSelfRecord(snapshot) ? 'confirmed' : 'claimed';
        if (!canTransition(snapshot, targetState, actor)) continue;

        if (record.kind === 'contribution') {
          if (
            record.payerMembershipId !== viewerMembership._id ||
            record.roundId === undefined
          ) {
            continue;
          }
          const round = await ctx.db.get(record.roundId);
          if (!round) failAttention('Contribution references a missing Round');
          const existing = contributionsByRound.get(round._id);
          contributionsByRound.set(round._id, {
            round,
            amount: (existing?.amount ?? 0) + record.amount,
            recordCount: (existing?.recordCount ?? 0) + 1,
            isArrears: (existing?.isArrears ?? false) || record.isArrears === true,
            sourceCreatedAt: Math.min(
              existing?.sourceCreatedAt ?? Number.POSITIVE_INFINITY,
              record._creationTime
            ),
          });
        }

        if (record.kind === 'payout') {
          if (record.roundId === undefined) {
            failAttention('Payout PaymentRecord is missing its Round');
          }
          const round = await ctx.db.get(record.roundId);
          if (!round) failAttention('Payout references a missing Round');
          const beneficiaryName = await membershipName(
            ctx,
            membershipById,
            record.payeeMembershipId
          );
          actionCandidates.push({
            action: {
              id: stableAttentionId(
                'record_payout_handover',
                group._id,
                record._id
              ),
              kind: 'record_payout_handover',
              group: groupRef,
              capacity:
                record.payerMembershipId === viewerMembership._id
                  ? viewerMembership.role
                  : 'member',
              priority: 'operate',
              dueAt: round.dueAt,
              roundId: round._id,
              paymentRecordId: record._id,
              beneficiaryName,
              amount: record.amount,
              claimSide:
                record.payerMembershipId === viewerMembership._id
                  ? 'payer'
                  : 'payee',
              destination: {
                kind: 'round',
                groupId: group._id,
                roundId: round._id,
              },
            },
            sourceCreatedAt: record._creationTime,
          });
        }
      }

      for (const contribution of contributionsByRound.values()) {
        actionCandidates.push({
          action: {
            id: stableAttentionId(
              'record_contribution',
              group._id,
              contribution.round._id
            ),
            kind: 'record_contribution',
            group: groupRef,
            capacity: 'member',
            priority: 'operate',
            dueAt: contribution.round.dueAt,
            roundId: contribution.round._id,
            recordCount: contribution.recordCount,
            amount: contribution.amount,
            isArrears: contribution.isArrears,
            destination: {
              kind: 'round_payment',
              groupId: group._id,
              roundId: contribution.round._id,
            },
          },
          sourceCreatedAt: contribution.sourceCreatedAt,
        });
      }

      const activeMembers = canonicalMemberships.filter(
        (membership) => membership.status === 'active'
      );
      const activePresident = activeMembers.find(
        (membership) => membership.role === 'president'
      );
      const activeTreasurer = activeMembers.find(
        (membership) => membership.role === 'treasurer'
      );
      const pendingMemberships = canonicalMemberships.filter(
        (membership) => membership.status === 'pending_approval'
      );

      if (
        pendingMemberships.length > 0 &&
        (viewerMembership.role === 'president' ||
          viewerMembership.role === 'treasurer')
      ) {
        const oldest = pendingMemberships.reduce((left, right) =>
          left.joinedAt <= right.joinedAt ? left : right
        );
        actionCandidates.push({
          action: {
            id: stableAttentionId(
              'review_membership_requests',
              group._id,
              'pending'
            ),
            kind: 'review_membership_requests',
            group: groupRef,
            capacity: viewerMembership.role,
            priority: 'prepare',
            dueAt: null,
            pendingCount: pendingMemberships.length,
            oldestRequestAt: oldest.joinedAt,
            destination: {
              kind: 'member_requests',
              groupId: group._id,
            },
          },
          sourceCreatedAt: oldest._creationTime,
        });
      }

      if (!activePresident && viewerMembership.role === 'treasurer') {
        actionCandidates.push({
          action: {
            id: stableAttentionId(
              'assign_president',
              group._id,
              'missing'
            ),
            kind: 'assign_president',
            group: groupRef,
            capacity: 'treasurer',
            priority: 'prepare',
            dueAt: null,
            activeMemberCount: activeMembers.length,
            destination: {
              kind: 'group_overview',
              groupId: group._id,
            },
          },
          sourceCreatedAt: group._creationTime,
        });
      }

      const canPrepareCycle =
        group.status === 'setup' || group.status === 'between_cycles';
      const isOfficer =
        viewerMembership.role === 'president' ||
        viewerMembership.role === 'treasurer';
      if (canPrepareCycle && isOfficer && !activeCycle) {
        let nextStep:
          | 'add_members'
          | 'assign_treasurer'
          | 'arrange_rotation'
          | null = null;
        if (activeMembers.length < 2) {
          nextStep = 'add_members';
        } else if (!activeTreasurer && viewerMembership.role === 'president') {
          nextStep = 'assign_treasurer';
        } else if (activePresident && activeTreasurer) {
          const validDraft =
            draftCycle !== null &&
            validateRotationOrder(
              draftCycle.rotationOrder,
              activeMembers.map((membership) => membership._id)
            ).ok;
          if (!validDraft) nextStep = 'arrange_rotation';
        }

        if (nextStep !== null) {
          actionCandidates.push({
            action: {
              id: stableAttentionId(
                'prepare_draft_cycle',
                group._id,
                nextStep
              ),
              kind: 'prepare_draft_cycle',
              group: groupRef,
              capacity: viewerMembership.role,
              priority: 'prepare',
              dueAt: null,
              activeMemberCount: activeMembers.length,
              draftCycleId: draftCycle?._id ?? null,
              nextStep,
              destination:
                nextStep === 'arrange_rotation'
                  ? { kind: 'draft_cycle', groupId: group._id }
                  : { kind: 'group_overview', groupId: group._id },
            },
            sourceCreatedAt: draftCycle?._creationTime ?? group._creationTime,
          });
        } else if (draftCycle && activePresident && activeTreasurer) {
          if (viewerMembership.role === 'president') {
            actionCandidates.push({
              action: {
                id: stableAttentionId(
                  'lock_draft_cycle',
                  group._id,
                  draftCycle._id
                ),
                kind: 'lock_draft_cycle',
                group: groupRef,
                capacity: 'president',
                priority: 'prepare',
                dueAt: null,
                draftCycleId: draftCycle._id,
                memberCount: activeMembers.length,
                destination: {
                  kind: 'draft_cycle',
                  groupId: group._id,
                },
              },
              sourceCreatedAt: draftCycle._creationTime,
            });
          } else {
            waitingCandidates.push({
              waiting: {
                id: stableAttentionId(
                  'cycle_awaiting_president',
                  group._id,
                  draftCycle._id
                ),
                kind: 'cycle_awaiting_president',
                group: groupRef,
                draftCycleId: draftCycle._id,
                destination: {
                  kind: 'group_overview',
                  groupId: group._id,
                },
              },
              expectedByAt: null,
              sourceCreatedAt: draftCycle._creationTime,
            });
          }
        }
      }

      if (activeCycle) {
        const roundResult = await ctx.db
          .query('rounds')
          .withIndex('by_cycle', (q) => q.eq('cycleId', activeCycle._id))
          .take(MAX_ROUNDS_PER_CYCLE + 1);
        if (roundResult.length > MAX_ROUNDS_PER_CYCLE) truncated = true;
        const rounds = roundResult.slice(0, MAX_ROUNDS_PER_CYCLE);
        const relevantRounds = rounds
          .filter(
            (round) =>
              round.status === 'scheduled' ||
              round.status === 'open' ||
              round.status === 'grace'
          )
          .sort((left, right) => left.dueAt - right.dueAt);

        if (group.status === 'active') {
          const upcoming = relevantRounds[0];
          if (upcoming && (!nextEvent || upcoming.dueAt < nextEvent.dueAt)) {
            nextEvent = {
              group: groupRef,
              roundId: upcoming._id,
              roundIndex: upcoming.index,
              status: upcoming.status,
              beneficiaryName: await membershipName(
                ctx,
                membershipById,
                upcoming.beneficiaryMembershipId
              ),
              dueAt: upcoming.dueAt,
            };
          }

          const meetingRound = relevantRounds.find(
            (round) => round.status === 'open' || round.status === 'grace'
          );
          if (
            meetingRound &&
            activeCycle.collectionMode === 'via_treasurer' &&
            viewerMembership.role === 'treasurer'
          ) {
            const meetingStatus =
              meetingRound.status === 'grace' ? ('grace' as const) : ('open' as const);
            actionCandidates.push({
              action: {
                id: stableAttentionId(
                  'run_meeting',
                  group._id,
                  meetingRound._id
                ),
                kind: 'run_meeting',
                group: groupRef,
                capacity: 'treasurer',
                priority:
                  meetingStatus === 'grace' ? 'blocking' : 'operate',
                dueAt: meetingRound.dueAt,
                roundId: meetingRound._id,
                roundIndex: meetingRound.index,
                roundStatus: meetingStatus,
                beneficiaryName: await membershipName(
                  ctx,
                  membershipById,
                  meetingRound.beneficiaryMembershipId
                ),
                destination: {
                  kind: 'meeting_mode',
                  groupId: group._id,
                  roundId: meetingRound._id,
                },
              },
              sourceCreatedAt: meetingRound._creationTime,
            });
          }
        }
      }
    }

    actionCandidates.sort((left, right) =>
      compareAttentionActions(
        {
          id: left.action.id,
          kind: actionKind(left.action),
          priority: left.action.priority,
          dueAt: left.action.dueAt,
          sourceCreatedAt: left.sourceCreatedAt,
        },
        {
          id: right.action.id,
          kind: actionKind(right.action),
          priority: right.action.priority,
          dueAt: right.action.dueAt,
          sourceCreatedAt: right.sourceCreatedAt,
        }
      )
    );
    waitingCandidates.sort((left, right) => {
      const deadline =
        (left.expectedByAt ?? Number.POSITIVE_INFINITY) -
        (right.expectedByAt ?? Number.POSITIVE_INFINITY);
      if (deadline !== 0) return deadline;
      const created = left.sourceCreatedAt - right.sourceCreatedAt;
      return created !== 0
        ? created
        : left.waiting.id.localeCompare(right.waiting.id, 'en');
    });

    if (actionCandidates.length > MAX_ACTIONS) truncated = true;
    if (waitingCandidates.length > MAX_WAITING_FACTS) truncated = true;
    const actions = actionCandidates
      .slice(0, MAX_ACTIONS)
      .map((candidate) => candidate.action);
    const waiting = waitingCandidates
      .slice(0, MAX_WAITING_FACTS)
      .map((candidate) => candidate.waiting);

    return {
      actions,
      waiting,
      nextEvent,
      badgeCount: actions.length,
      truncated,
    };
  },
});
