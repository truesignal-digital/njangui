import type { FunctionReturnType } from 'convex/server';

import { api } from './convex-api';
import { toIntlLocale } from './app-locale';
import { formatCurrencyXAF } from './format-currency';

export type AttentionSnapshot = FunctionReturnType<typeof api.attention.readV1>;
export type AttentionAction = AttentionSnapshot['actions'][number];
export type WaitingFact = AttentionSnapshot['waiting'][number];
export type AttentionDestination = AttentionAction['destination'];

type Translate = (
  key: string,
  options?: Record<string, string | number>
) => string;

export type AttentionCardModel = {
  id: string;
  kind: AttentionAction['kind'];
  context: string;
  title: string;
  detail: string;
  cta: string;
  amount: string | null;
  deadline: string | null;
  tone: 'accent' | 'danger' | 'neutral';
};

export type WaitingModel = {
  id: string;
  title: string;
  detail: string;
  openLabel: string | null;
};

function deadlineLabel(
  dueAt: number | null,
  priority: AttentionAction['priority'],
  t: Translate,
  locale: string,
  now: number
): string | null {
  if (priority === 'blocking') return t('attention.priority.blocking');
  if (dueAt === null) return null;

  const due = new Date(dueAt);
  const today = new Date(now);
  if (dueAt < now) {
    const daysLate = Math.floor((now - dueAt) / 86_400_000);
    return daysLate >= 1
      ? t('attention.priority.overdueDays', { count: daysLate })
      : t('attention.priority.overdue');
  }
  if (due.toDateString() === today.toDateString()) {
    return t('attention.priority.today');
  }
  return due.toLocaleDateString(toIntlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function presentAttentionAction(
  action: AttentionAction,
  t: Translate,
  locale: string,
  now = Date.now()
): AttentionCardModel {
  const context = t('attention.context', {
    group: action.group.name,
    role: t(`groups.roles.${action.capacity}`),
  });
  const deadline = deadlineLabel(
    action.dueAt,
    action.priority,
    t,
    locale,
    now
  );

  switch (action.kind) {
    case 'resolve_dispute':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.resolveDispute.title'),
        detail: t('attention.action.resolveDispute.detail', {
          payer: action.payerName,
          payee: action.payeeName,
        }),
        cta: t('attention.action.resolveDispute.cta'),
        amount: formatCurrencyXAF(action.amount),
        deadline,
        tone: 'danger',
      };
    case 'confirm_records':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.confirmRecords.title', {
          count: action.recordCount,
        }),
        detail: t('attention.action.confirmRecords.detail', {
          amount: formatCurrencyXAF(action.totalAmount),
        }),
        cta: t('attention.action.confirmRecords.cta'),
        amount: null,
        deadline,
        tone: 'accent',
      };
    case 'run_meeting':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.runMeeting.title'),
        detail: t('attention.action.runMeeting.detail', {
          round: action.roundIndex,
          beneficiary: action.beneficiaryName,
        }),
        cta: t('attention.action.runMeeting.cta'),
        amount: null,
        deadline,
        tone: 'accent',
      };
    case 'record_payout_handover':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.recordPayout.title'),
        detail: t('attention.action.recordPayout.detail', {
          beneficiary: action.beneficiaryName,
        }),
        cta: t('attention.action.recordPayout.cta'),
        amount: formatCurrencyXAF(action.amount),
        deadline,
        tone: 'accent',
      };
    case 'confirm_payout_handover':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.confirmPayout.title'),
        detail: t('attention.action.confirmPayout.detail', {
          beneficiary: action.beneficiaryName,
        }),
        cta: t('attention.action.confirmPayout.cta'),
        amount: formatCurrencyXAF(action.amount),
        deadline,
        tone: 'accent',
      };
    case 'record_contribution':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: action.isArrears
          ? t('attention.action.recordContribution.arrearsTitle')
          : t('attention.action.recordContribution.title'),
        detail: t('attention.action.recordContribution.detail'),
        cta: t('attention.action.recordContribution.cta'),
        amount: formatCurrencyXAF(action.amount),
        deadline,
        tone: 'accent',
      };
    case 'review_membership_requests':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.reviewMembers.title', {
          count: action.pendingCount,
        }),
        detail: t('attention.action.reviewMembers.detail'),
        cta: t('attention.action.reviewMembers.cta'),
        amount: null,
        deadline,
        tone: 'neutral',
      };
    case 'assign_president':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.assignPresident.title'),
        detail: t('attention.action.assignPresident.detail'),
        cta: t('attention.action.assignPresident.cta'),
        amount: null,
        deadline,
        tone: 'neutral',
      };
    case 'prepare_draft_cycle':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t(`attention.action.prepareCycle.${action.nextStep}.title`),
        detail: t(`attention.action.prepareCycle.${action.nextStep}.detail`),
        cta: t(`attention.action.prepareCycle.${action.nextStep}.cta`),
        amount: null,
        deadline,
        tone: 'neutral',
      };
    case 'lock_draft_cycle':
      return {
        id: action.id,
        kind: action.kind,
        context,
        title: t('attention.action.lockCycle.title'),
        detail: t('attention.action.lockCycle.detail', {
          count: action.memberCount,
        }),
        cta: t('attention.action.lockCycle.cta'),
        amount: null,
        deadline,
        tone: 'neutral',
      };
  }
}

export function presentWaitingFact(
  waiting: WaitingFact,
  t: Translate
): WaitingModel {
  switch (waiting.kind) {
    case 'records_awaiting_confirmation':
      return {
        id: waiting.id,
        title: t('attention.waiting.records.title', {
          count: waiting.recordCount,
        }),
        detail: t('attention.waiting.records.detail', {
          amount: formatCurrencyXAF(waiting.totalAmount),
          group: waiting.group.name,
        }),
        openLabel: t('attention.waiting.openGroup'),
      };
    case 'membership_awaiting_approval':
      return {
        id: waiting.id,
        title: t('attention.waiting.membership.title'),
        detail: t('attention.waiting.membership.detail', {
          group: waiting.group.name,
        }),
        openLabel: null,
      };
    case 'cycle_awaiting_president':
      return {
        id: waiting.id,
        title: t('attention.waiting.cycle.title'),
        detail: t('attention.waiting.cycle.detail', {
          group: waiting.group.name,
        }),
        openLabel: t('attention.waiting.openGroup'),
      };
  }
}

export function waitingFactCount(waiting: readonly WaitingFact[]): number {
  return waiting.reduce(
    (total, fact) =>
      total +
      (fact.kind === 'records_awaiting_confirmation' ? fact.recordCount : 1),
    0
  );
}

export function presentNextEvent(
  nextEvent: NonNullable<AttentionSnapshot['nextEvent']>,
  t: Translate,
  locale: string
) {
  return {
    title: new Date(nextEvent.dueAt).toLocaleDateString(
      toIntlLocale(locale),
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }
    ),
    detail: t('attention.nextEvent.detail', {
      group: nextEvent.group.name,
      beneficiary: nextEvent.beneficiaryName,
    }),
  };
}
