import type { Id } from '../_generated/dataModel';

/*
 * Single source of push deep-link URLs. The client-side allowlist in
 * src/hooks/use-push-notifications.ts only routes paths with these
 * prefixes, and the strings must match routes under app/ — adding a new
 * link shape means a builder here plus a prefix there, never a template
 * literal at a call site.
 */
export const paymentLink = (paymentId: Id<'paymentRecords'>) => `/payments/${paymentId}`;

export const groupLink = (groupId: Id<'groups'>) => `/groups/${groupId}`;
