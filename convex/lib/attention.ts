export type AttentionPriority =
  | 'blocking'
  | 'respond'
  | 'operate'
  | 'prepare';

export type AttentionKind =
  | 'resolve_dispute'
  | 'confirm_records'
  | 'run_meeting'
  | 'record_payout_handover'
  | 'confirm_payout_handover'
  | 'record_contribution'
  | 'review_membership_requests'
  | 'assign_president'
  | 'lock_draft_cycle'
  | 'prepare_draft_cycle';

export type RankableAttentionAction = {
  id: string;
  kind: AttentionKind;
  priority: AttentionPriority;
  dueAt: number | null;
  sourceCreatedAt: number;
};

const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  blocking: 0,
  respond: 1,
  operate: 2,
  prepare: 3,
};

const KIND_ORDER: Record<AttentionKind, number> = {
  resolve_dispute: 0,
  run_meeting: 1,
  confirm_records: 2,
  confirm_payout_handover: 3,
  record_payout_handover: 4,
  record_contribution: 5,
  review_membership_requests: 6,
  assign_president: 7,
  lock_draft_cycle: 8,
  prepare_draft_cycle: 9,
};

/** Locale-independent total order shared by Today, Actions, and badges. */
export function compareAttentionActions(
  left: RankableAttentionAction,
  right: RankableAttentionAction
): number {
  const priority =
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
  if (priority !== 0) return priority;

  const kind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
  if (kind !== 0) return kind;

  const deadline =
    (left.dueAt ?? Number.POSITIVE_INFINITY) -
    (right.dueAt ?? Number.POSITIVE_INFINITY);
  if (deadline !== 0) return deadline;

  const created = left.sourceCreatedAt - right.sourceCreatedAt;
  if (created !== 0) return created;

  return left.id.localeCompare(right.id, 'en');
}

export function stableAttentionId(
  kind: string,
  groupId: string,
  subject: string
): string {
  return `v1:${kind}:${groupId}:${subject}`;
}

export function earliestTimestamp(
  current: number | null,
  candidate: number | null
): number | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  return Math.min(current, candidate);
}
