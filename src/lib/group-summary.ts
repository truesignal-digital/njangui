export const GROUP_PURPOSES = [
  'funeral',
  'wedding',
  'birthday',
  'family',
  'school',
  'church',
  'business',
  'savings',
  'travel',
  'gift',
  'association',
  'other',
] as const;

export type GroupPurpose = (typeof GROUP_PURPOSES)[number];

type GroupSummaryBase = {
  id: string;
  title: string;
  purpose: GroupPurpose;
  viewerActionCount: number;
  href: string;
};

export type ContributionGroupSummary = GroupSummaryBase & {
  mode: 'contribution';
  status: 'draft' | 'open' | 'closed' | 'cancelled';
  confirmedAmount: number;
  goalAmount: number | null;
  awaitingConfirmationCount: number;
  deadlineAt: number;
};

export type NjangiGroupSummary = GroupSummaryBase & {
  mode: 'njangi';
  status: 'setup' | 'active' | 'paused' | 'between_cycles' | 'archived';
  nextDueAt: number | null;
  viewerDueAmount: number | null;
  viewerReceivingAmount: number | null;
};

export type GroupSummary = ContributionGroupSummary | NjangiGroupSummary;

function lifecycleRank(group: GroupSummary) {
  if (group.mode === 'contribution') {
    if (group.status === 'open') return 0;
    if (group.status === 'draft') return 1;
    return 2;
  }

  if (group.status === 'active') return 0;
  if (group.status === 'setup' || group.status === 'between_cycles') return 1;
  return 2;
}

function relevantDate(group: GroupSummary) {
  if (group.mode === 'contribution') return group.deadlineAt;
  return group.nextDueAt ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The mixed Groups stream is action-first, then lifecycle/date aware. Mode is
 * deliberately absent from the comparator so Contributions and Njangis never
 * become accidental sections.
 */
export function sortGroupSummaries(groups: readonly GroupSummary[]) {
  return [...groups].sort((a, b) => {
    const actionRankA = a.viewerActionCount > 0 ? 0 : 1;
    const actionRankB = b.viewerActionCount > 0 ? 0 : 1;
    if (actionRankA !== actionRankB) return actionRankA - actionRankB;

    const lifecycleDelta = lifecycleRank(a) - lifecycleRank(b);
    if (lifecycleDelta !== 0) return lifecycleDelta;

    const dateDelta = relevantDate(a) - relevantDate(b);
    if (dateDelta !== 0) return dateDelta;

    return a.title.localeCompare(b.title);
  });
}
