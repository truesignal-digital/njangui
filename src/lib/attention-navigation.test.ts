import { describe, expect, it, mock } from 'bun:test';

import type { AttentionDestination } from './attention-presentation';

mock.module('expo-router', () => ({ router: { push: () => {} } }));

const { attentionHref } = await import('./attention-navigation');

const destinations: Record<AttentionDestination['kind'], AttentionDestination> = {
  payment_record: { kind: 'payment_record', paymentRecordId: 'pr1' as never },
  confirmation_queue: { kind: 'confirmation_queue', groupId: 'g1' as never },
  meeting_mode: {
    kind: 'meeting_mode',
    groupId: 'g1' as never,
    roundId: 'r1' as never,
  },
  round: { kind: 'round', groupId: 'g1' as never, roundId: 'r1' as never },
  round_payment: {
    kind: 'round_payment',
    groupId: 'g1' as never,
    roundId: 'r1' as never,
  },
  member_requests: { kind: 'member_requests', groupId: 'g1' as never },
  group_overview: { kind: 'group_overview', groupId: 'g1' as never },
  draft_cycle: { kind: 'draft_cycle', groupId: 'g1' as never },
};

describe('attentionHref', () => {
  it('never routes a destination back to the Actions tab itself', () => {
    for (const destination of Object.values(destinations)) {
      const href = attentionHref(destination);
      const pathname = typeof href === 'string' ? href : href.pathname;
      expect(pathname).not.toBe('/inbox');
    }
  });

  it('opens the group confirm list for a confirmation queue', () => {
    expect(attentionHref(destinations.confirmation_queue)).toEqual({
      pathname: '/groups/[groupId]/confirmations',
      params: { groupId: 'g1' },
    });
  });
});
