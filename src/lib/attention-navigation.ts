import { router, type Href } from 'expo-router';

import type { AttentionDestination } from './attention-presentation';

export function attentionHref(destination: AttentionDestination): Href {
  switch (destination.kind) {
    case 'payment_record':
      return {
        pathname: '/payments/[paymentId]',
        params: { paymentId: destination.paymentRecordId },
      };
    case 'confirmation_queue':
      return '/inbox';
    case 'meeting_mode':
      return {
        pathname: '/groups/[groupId]/rounds/[roundId]/meeting',
        params: {
          groupId: destination.groupId,
          roundId: destination.roundId,
        },
      };
    case 'round':
      return {
        pathname: '/groups/[groupId]/rounds/[roundId]',
        params: {
          groupId: destination.groupId,
          roundId: destination.roundId,
        },
      };
    case 'round_payment':
      return {
        pathname: '/groups/[groupId]/rounds/[roundId]/pay',
        params: {
          groupId: destination.groupId,
          roundId: destination.roundId,
        },
      };
    case 'member_requests':
    case 'group_overview':
      return {
        pathname: '/groups/[groupId]',
        params: { groupId: destination.groupId },
      };
    case 'draft_cycle':
      return {
        pathname: '/groups/[groupId]/start-cycle',
        params: { groupId: destination.groupId },
      };
  }
}

export function openAttentionDestination(destination: AttentionDestination) {
  router.push(attentionHref(destination));
}
