import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api, type Id } from '../lib/convex-api';
import { formatCurrencyXAF } from '../lib/format-currency';
import { Skeleton } from './skeleton';

/**
 * Agenda list (docs/03) — njangi events are sparse (one per group per
 * period), so months are section headers with a money summary line
 * (« vous cotisez X · vous recevez Y ») instead of a mostly-empty grid.
 * Estimated rows (setup groups) are greyed and tagged; past rows dimmed.
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
  estimated: boolean;
};

type MonthSection = {
  key: string;
  label: string;
  contrib: number;
  receive: number;
  events: AgendaEvent[];
};

function toSections(events: AgendaEvent[], locale: string): MonthSection[] {
  const sections = new Map<string, MonthSection>();
  for (const event of events) {
    const d = new Date(event.date);
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
        events: [],
      };
      sections.set(key, section);
    }
    if (event.kind === 'contribution') {
      section.contrib += event.amount;
    } else if (event.isMyPayout) {
      section.receive += event.amount;
    }
    section.events.push(event);
  }
  return [...sections.values()];
}

function EventRow({
  event,
  showGroupName,
  locale,
}: {
  event: AgendaEvent;
  showGroupName: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const past = event.date < Date.now();
  const day = new Date(event.date).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
  });

  const label =
    event.kind === 'payout'
      ? event.isMyPayout
        ? t('calendar.youReceive', {
            n: event.roundIndex,
            amount: formatCurrencyXAF(event.amount),
          })
        : t('calendar.receives', {
            n: event.roundIndex,
            name: event.beneficiaryName ?? '—',
          })
      : `${t('calendar.contribution', {
          amount: formatCurrencyXAF(event.amount),
        })}${event.hands > 1 ? ` ${t('calendar.hands', { count: event.hands })}` : ''}`;

  const tone =
    event.estimated || past
      ? 'text-placeholder'
      : event.isMyPayout
        ? 'text-success-dark'
        : event.kind === 'contribution'
          ? 'text-foreground'
          : 'text-muted';

  return (
    <View className="flex-row items-baseline gap-sm py-xs">
      <Text className="w-[64px] font-body-medium text-body-sm text-muted">
        {day}
      </Text>
      <View className="min-w-0 flex-1">
        {showGroupName ? (
          <Text
            className="font-body text-caption text-muted"
            numberOfLines={1}
          >
            {event.groupName}
          </Text>
        ) : null}
        <Text
          className={`font-body-medium text-body-sm ${tone}`}
          numberOfLines={2}
        >
          {label}
          {event.estimated ? (
            <Text className="font-body text-caption text-placeholder">
              {' '}
              {t('calendar.estimated')}
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

export function CalendarAgenda({
  groupId,
  showGroupName,
}: {
  groupId?: string;
  showGroupName: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';
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
    () => (events ? toSections(events, locale) : []),
    [events, locale]
  );

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
      {sections.map((section) => (
        <View key={section.key} className="gap-xs">
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
            {section.events.map((event, i) => (
              <EventRow
                key={`${event.groupId}:${event.roundIndex}:${event.kind}:${i}`}
                event={event}
                showGroupName={showGroupName}
                locale={locale}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
