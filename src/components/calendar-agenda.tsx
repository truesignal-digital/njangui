import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api, type Id } from '../lib/convex-api';
import { toIntlLocale } from '../lib/app-locale';
import { formatCurrencyXAF } from '../lib/format-currency';
import { InOutCells } from './ui/in-out-cells';
import { Skeleton } from './skeleton';

/**
 * Agenda list (docs/03) — njangi events are sparse (one per group per
 * period), so months are section headers with a money summary line
 * (« vous cotisez X · vous recevez Y ») instead of a mostly-empty grid.
 *
 * Two modes:
 * - 'my' (Calendar tab): UPCOMING sessions only, ONE row per group per
 *   round — what I pay, what I collect. Other members' turns are noise
 *   here and stay out.
 * - 'group' (group calendar): the whole season, every round with its
 *   beneficiary, past rows dimmed.
 */

type AgendaEvent = {
  date: number;
  groupId: string;
  groupName: string;
  roundIndex: number;
  kind: 'payout' | 'contribution';
  amount: number;
  beneficiaryName: string | null;
  isMyPayout: boolean;
  hands: number;
  myHandNumber: number | null;
  estimated: boolean;
};

type SessionRow = {
  date: number;
  groupId: string;
  groupName: string;
  roundIndex: number;
  contribution: number; // 0 ⇒ resting beneficiary round
  hands: number;
  myPayout: number; // 0 ⇒ not my turn
  myHandNumber: number | null; // which of my hands collects this round
  beneficiaryName: string | null; // group mode only
  estimated: boolean;
};

type MonthSection = {
  key: string;
  label: string;
  contrib: number;
  receive: number;
  rows: SessionRow[];
};

/** One row per group-round: contribution + my payout folded together. */
function toSessions(events: AgendaEvent[], upcomingOnly: boolean): SessionRow[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessions = new Map<string, SessionRow>();
  for (const event of events) {
    if (upcomingOnly && event.date < todayStart.getTime()) {
      continue;
    }
    const key = `${event.groupId}:${event.roundIndex}`;
    let row = sessions.get(key);
    if (!row) {
      row = {
        date: event.date,
        groupId: event.groupId,
        groupName: event.groupName,
        roundIndex: event.roundIndex,
        contribution: 0,
        hands: event.hands,
        myPayout: 0,
        myHandNumber: null,
        beneficiaryName: event.beneficiaryName,
        estimated: event.estimated,
      };
      sessions.set(key, row);
    }
    if (event.kind === 'contribution') {
      row.contribution = event.amount;
    } else if (event.isMyPayout) {
      row.myPayout = event.amount;
      row.myHandNumber = event.myHandNumber;
    }
  }
  return [...sessions.values()].sort((a, b) => a.date - b.date);
}

function toSections(rows: SessionRow[], locale: string): MonthSection[] {
  const sections = new Map<string, MonthSection>();
  for (const row of rows) {
    const d = new Date(row.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let section = sections.get(key);
    if (!section) {
      const label = d.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
      section = {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        contrib: 0,
        receive: 0,
        rows: [],
      };
      sections.set(key, section);
    }
    section.contrib += row.contribution;
    section.receive += row.myPayout;
    section.rows.push(row);
  }
  return [...sections.values()];
}

function SessionLine({
  row,
  mode,
  locale,
}: {
  row: SessionRow;
  mode: 'my' | 'group';
  locale: string;
}) {
  const { t } = useTranslation();
  const past = row.date < Date.now();
  const dimmed = row.estimated || (mode === 'group' && past);
  const day = new Date(row.date).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
  });

  const parts: string[] = [];
  if (row.contribution > 0) {
    parts.push(
      `${t('calendar.contribution', {
        amount: formatCurrencyXAF(row.contribution),
      })}${row.hands > 1 ? ` ${t('calendar.hands', { count: row.hands })}` : ''}`
    );
  }
  if (row.myPayout > 0) {
    const receive = t('calendar.youReceiveShort', {
      amount: formatCurrencyXAF(row.myPayout),
    });
    parts.push(
      row.myHandNumber !== null
        ? `${receive} (${t('calendar.handOf', {
            n: row.myHandNumber,
            total: row.hands,
          })})`
        : receive
    );
  }
  if (mode === 'group' && row.myPayout === 0 && row.beneficiaryName) {
    parts.push(t('calendar.receivesShort', { name: row.beneficiaryName }));
  }

  return (
    <View className="flex-row items-baseline gap-sm py-xs">
      <Text className="w-[64px] font-body-medium text-body-sm text-muted">
        {day}
      </Text>
      <View className="min-w-0 flex-1">
        <Text
          className={`font-body-medium text-body-sm ${dimmed ? 'text-placeholder' : 'text-foreground'}`}
          numberOfLines={1}
        >
          {mode === 'my'
            ? `${row.groupName} · ${t('calendar.roundLabel', { n: row.roundIndex })}`
            : t('calendar.roundLabel', { n: row.roundIndex })}
          {row.estimated ? ` ${t('calendar.estimated')}` : ''}
        </Text>
        <Text
          className={`font-body text-body-sm ${
            dimmed
              ? 'text-placeholder'
              : row.myPayout > 0
                ? 'text-success-dark'
                : 'text-muted'
          }`}
          numberOfLines={2}
        >
          {parts.join(' · ')}
        </Text>
      </View>
    </View>
  );
}

export function CalendarAgenda({
  groupId,
  mode,
  showMonthSummary = false,
}: {
  groupId?: string;
  mode: 'my' | 'group';
  /** Money-hero planner header: current-month sorties/entrées cells. */
  showMonthSummary?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = toIntlLocale(i18n.language);
  const { isAuthenticated } = useConvexAuth();
  const events = useQuery(
    api.calendar.myAgenda,
    isAuthenticated
      ? groupId
        ? { groupId: groupId as Id<'groups'> }
        : {}
      : 'skip'
  );

  const sections = useMemo(
    () =>
      events ? toSections(toSessions(events, mode === 'my'), locale) : [],
    [events, mode, locale]
  );

  // Current-month in/out from the events already subscribed — no extra
  // query; whole-month totals (past rounds included), unlike the
  // upcoming-only agenda rows below.
  const monthSummary = useMemo(() => {
    if (!showMonthSummary || !events) return null;
    const now = new Date();
    let out = 0;
    let incoming = 0;
    for (const event of events) {
      const d = new Date(event.date);
      if (
        d.getFullYear() !== now.getFullYear() ||
        d.getMonth() !== now.getMonth()
      ) {
        continue;
      }
      if (event.kind === 'contribution') out += event.amount;
      else if (event.isMyPayout) incoming += event.amount;
    }
    if (out === 0 && incoming === 0) return null;
    const month = now.toLocaleDateString(locale, { month: 'long' });
    return { out, incoming, month };
  }, [showMonthSummary, events, locale]);

  if (events === undefined) {
    return (
      <View className="gap-sm">
        <Skeleton className="h-[24px] w-[180px]" />
        <Skeleton className="h-[72px] rounded-lg" />
        <Skeleton className="h-[72px] rounded-lg" />
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <Text className="font-body text-body-sm text-muted">
        {t('calendar.empty')}
      </Text>
    );
  }

  return (
    <View className="gap-md">
      {monthSummary ? (
        <InOutCells
          payLabel={t('calendar.monthOut', { month: monthSummary.month })}
          payAmount={formatCurrencyXAF(monthSummary.out)}
          receiveLabel={t('calendar.monthIn', { month: monthSummary.month })}
          receiveAmount={formatCurrencyXAF(monthSummary.incoming)}
        />
      ) : null}
      {sections.map((section, index) => (
        <Animated.View
          key={section.key}
          entering={FadeInDown.duration(240).delay(Math.min(index, 5) * 45)}
          className="gap-xs"
        >
          <Text className="font-body-semi text-body text-foreground">
            {section.label}
          </Text>
          {section.contrib > 0 || section.receive > 0 ? (
            <Text className="font-body text-caption text-muted">
              {section.receive > 0
                ? t('calendar.monthSummaryBoth', {
                    contrib: formatCurrencyXAF(section.contrib),
                    receive: formatCurrencyXAF(section.receive),
                  })
                : t('calendar.monthSummaryContrib', {
                    contrib: formatCurrencyXAF(section.contrib),
                  })}
            </Text>
          ) : null}
          <View className="rounded-xl bg-surface p-sm">
            {section.rows.map((row) => (
              <SessionLine
                key={`${row.groupId}:${row.roundIndex}`}
                row={row}
                mode={mode}
                locale={locale}
              />
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
