import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import {
  availableMobileMoneyMethod,
  mobileMoneyAvailability,
  type MethodAvailability,
  type MobileMoneyMethod,
} from '../../convex/lib/paymentMethods';
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

  // Server-resolved payee (getRound.payeeContact): the roster projection
  // gates phones to officers, so a member's pay flow must NOT read the
  // payee number from listMembers.
  const payee: { displayName: string; phone?: string } | null =
    round?.payeeContact ?? null;

  const methodAvailability: Record<MobileMoneyMethod, MethodAvailability> = {
    momo_mtn: mobileMoneyAvailability('momo_mtn', payee?.phone),
    orange_money: mobileMoneyAvailability('orange_money', payee?.phone),
  };

  return {
    loading: round === undefined || rows === undefined,
    round: round ?? null,
    myRow,
    record,
    payee,
    methodAvailability,
    suggestedMethod: availableMobileMoneyMethod(payee?.phone),
    reference: round ? `NJG-T${round.index}` : '',
  };
}
