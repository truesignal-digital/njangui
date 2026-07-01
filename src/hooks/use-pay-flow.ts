import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { api, type Id } from '../lib/convex-api';

type PaymentRow = FunctionReturnType<
  typeof api.rounds.listRoundPayments
>[number];
type PaymentRecordItem = PaymentRow['records'][number];

/**
 * Shared data for the pay modal stack (docs/03 B4, kind-aware via
 * `?record=`): the round, the viewer's own row, the targeted pending
 * record (explicit `record` param, else the row's first pending), and the
 * payee identity (treasurer in via_treasurer mode, beneficiary in direct
 * mode — phone resolved from the roster for the USSD copy-tap field).
 */
export function usePayFlow(roundId: string | undefined, recordId?: string) {
  const { isAuthenticated } = useConvexAuth();
  const roundArgs =
    isAuthenticated && roundId
      ? { roundId: roundId as Id<'rounds'> }
      : ('skip' as const);
  const round = useQuery(api.rounds.getRound, roundArgs);
  const rows = useQuery(api.rounds.listRoundPayments, roundArgs);
  const members = useQuery(
    api.memberships.listMembers,
    isAuthenticated && round
      ? { groupId: round.groupId }
      : ('skip' as const)
  );

  const myRow =
    round && rows
      ? (rows.find((r) => r.membershipId === round.viewerMembershipId) ?? null)
      : null;

  let record: PaymentRecordItem | null = null;
  if (myRow) {
    record = recordId
      ? (myRow.records.find((r) => r.paymentRecordId === recordId) ?? null)
      : (myRow.records.find((r) => r.state === 'pending') ?? null);
  }

  let payee: { displayName: string; phone?: string } | null = null;
  if (round && members) {
    const payeeMembershipId =
      round.collectionMode === 'via_treasurer'
        ? (members.find((m) => m.role === 'treasurer' && m.status === 'active')
            ?.membershipId ?? null)
        : round.beneficiaryMembershipId;
    const match = members.find((m) => m.membershipId === payeeMembershipId);
    if (match) {
      payee = { displayName: match.displayName, phone: match.phone };
    }
  }

  return {
    loading: round === undefined || rows === undefined,
    round: round ?? null,
    myRow,
    record,
    payee,
    reference: round ? `NJG-T${round.index}` : '',
  };
}
