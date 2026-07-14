import type { Doc } from '../_generated/dataModel';
import type {
  Actor,
  PaymentRecordSnapshot,
  TransitionContext,
} from './paymentStateMachine';

/** The canonical state-machine projection of a persisted PaymentRecord. */
export function toPaymentRecordSnapshot(
  record: Doc<'paymentRecords'>
): PaymentRecordSnapshot {
  return {
    state: record.state,
    kind: record.kind,
    payerMembershipId: record.payerMembershipId,
    payeeMembershipId: record.payeeMembershipId,
    claimedBySide: record.claimedBySide,
  };
}

/** The human actor shape used by every PaymentRecord capability check. */
export function paymentActorForMembership(
  membership: Doc<'memberships'>
): Extract<Actor, { type: 'member' }> {
  return {
    type: 'member',
    membershipId: membership._id,
    isPresident: membership.role === 'president',
  };
}

/**
 * Presidents may act on behalf only when the counterparty cannot use the
 * application themselves. Keep this shared with Attention eligibility so a
 * displayed action and its authoritative mutation cannot disagree.
 */
export function membershipNeedsRepresentation(
  membership: Doc<'memberships'> | null
): boolean {
  if (!membership) {
    return false;
  }
  return (
    membership.userId === undefined ||
    membership.status === 'exited' ||
    membership.status === 'deceased'
  );
}

export function representationContext(
  counterparty: Doc<'memberships'> | null
): TransitionContext {
  return {
    counterpartyNeedsRepresentation:
      membershipNeedsRepresentation(counterparty),
  };
}
