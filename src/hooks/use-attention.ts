import { useConvexAuth, useQuery } from 'convex/react';

import { api, type Id } from '../lib/convex-api';

export type AttentionScope =
  | { kind: 'viewer' }
  | { kind: 'group'; groupId: Id<'groups'> };

/**
 * Wait for the Clerk identity and its mirrored Convex user row before
 * subscribing. This avoids treating the short webhook/bootstrap race as an
 * unauthenticated Attention error.
 */
export function useAttention(scope: AttentionScope = { kind: 'viewer' }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const currentUser = useQuery(
    api.users.current,
    isAuthenticated ? {} : 'skip'
  );
  const ready = isAuthenticated && currentUser !== undefined && currentUser !== null;
  const data = useQuery(api.attention.readV1, ready ? { scope } : 'skip');

  return {
    data,
    currentUser,
    isLoading:
      authLoading ||
      (isAuthenticated && (currentUser === undefined || currentUser === null)) ||
      (ready && data === undefined),
  };
}
