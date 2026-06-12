import { useEffect, useRef } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';

import { useUser } from '../lib/clerk-client';
import { api } from '../lib/convex-api';

/**
 * Webhook-race fallback (mirrors piol mobile's use-ensure-current-user and the
 * old web app's use-ensure-user): create the Convex user row from JWT claims
 * if the Clerk webhook hasn't landed yet. Idempotent.
 */
export function useEnsureCurrentUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const getOrCreateCurrentUser = useMutation(api.users.getOrCreateCurrentUser);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      attemptedRef.current = false;
      return;
    }

    if (
      !isLoaded ||
      isLoading ||
      !isAuthenticated ||
      currentUser === undefined ||
      attemptedRef.current
    ) {
      return;
    }

    if (currentUser) {
      attemptedRef.current = true;
      return;
    }

    attemptedRef.current = true;

    void getOrCreateCurrentUser().catch(() => {
      // Retry on the next auth change if Convex wasn't ready yet.
      attemptedRef.current = false;
    });
  }, [currentUser, getOrCreateCurrentUser, isAuthenticated, isLoaded, isLoading, isSignedIn, user]);
}
