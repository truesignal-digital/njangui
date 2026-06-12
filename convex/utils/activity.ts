import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Append one row to the activityEvents log (01 §3.1). The event log is the
 * single source the group feed renders from (02: every state-changing
 * mutation writes its row here). Append-only — nothing ever patches or
 * deletes an activityEvents row.
 */
export async function logActivityEvent(
  ctx: MutationCtx,
  event: {
    groupId: Id<'groups'>;
    kind: string;
    entityTable: string;
    entityId: string;
    fromState?: string;
    toState?: string;
    /** Absent ⇒ system actor. */
    actorMembershipId?: Id<'memberships'>;
    note?: string;
  }
): Promise<Id<'activityEvents'>> {
  return await ctx.db.insert('activityEvents', {
    groupId: event.groupId,
    kind: event.kind,
    entityTable: event.entityTable,
    entityId: event.entityId,
    fromState: event.fromState,
    toState: event.toState,
    actorMembershipId: event.actorMembershipId,
    note: event.note,
  });
}
