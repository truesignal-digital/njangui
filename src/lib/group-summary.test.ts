import { describe, expect, it } from 'bun:test';

import { sortGroupSummaries, type GroupSummary } from './group-summary';

const NOW = Date.UTC(2026, 6, 21);

const groups: GroupSummary[] = [
  {
    mode: 'contribution',
    id: 'closed-contribution',
    title: 'Closed contribution',
    purpose: 'gift',
    status: 'closed',
    confirmedAmount: 50_000,
    goalAmount: null,
    awaitingConfirmationCount: 0,
    deadlineAt: NOW - 1,
    viewerActionCount: 0,
    href: '/g/closed',
  },
  {
    mode: 'njangi',
    id: 'active-njangi',
    title: 'Active njangi',
    purpose: 'savings',
    status: 'active',
    nextDueAt: NOW + 2,
    viewerDueAmount: null,
    viewerReceivingAmount: null,
    viewerActionCount: 0,
    href: '/groups/active',
  },
  {
    mode: 'contribution',
    id: 'needs-viewer',
    title: 'Needs viewer',
    purpose: 'funeral',
    status: 'open',
    confirmedAmount: 75_000,
    goalAmount: 200_000,
    awaitingConfirmationCount: 1,
    deadlineAt: NOW + 5,
    viewerActionCount: 1,
    href: '/g/action',
  },
  {
    mode: 'contribution',
    id: 'open-contribution',
    title: 'Open contribution',
    purpose: 'wedding',
    status: 'open',
    confirmedAmount: 100_000,
    goalAmount: 300_000,
    awaitingConfirmationCount: 0,
    deadlineAt: NOW + 1,
    viewerActionCount: 0,
    href: '/g/open',
  },
];

describe('sortGroupSummaries', () => {
  it('mixes modes while keeping viewer action, lifecycle, and date priority', () => {
    expect(sortGroupSummaries(groups).map((group) => group.id)).toEqual([
      'needs-viewer',
      'open-contribution',
      'active-njangi',
      'closed-contribution',
    ]);
  });

  it('does not mutate the query result', () => {
    const originalOrder = groups.map((group) => group.id);

    sortGroupSummaries(groups);

    expect(groups.map((group) => group.id)).toEqual(originalOrder);
  });
});
