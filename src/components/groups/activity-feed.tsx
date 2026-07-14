import { Text, View } from 'react-native';
import { usePaginatedQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api, type Id } from '../../lib/convex-api';
import { toIntlLocale } from '../../lib/app-locale';
import { AppButton } from '../ui/button';
import { Skeleton } from '../skeleton';

/**
 * Group activity feed (05 M7, Slice 7) — immutable who-did-what-when.
 * Kind → copy mapping lives in the `feed.*` locale namespace with a
 * generic fallback so an unmapped kind renders honestly instead of
 * disappearing. Auto-events (no actor) render without a name.
 */
export function ActivityFeed({
  groupId,
  compact = false,
}: {
  groupId: Id<'groups'>;
  /** Group-screen preview: few items, no load-more (the page has both). */
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.listGroupFeed,
    { groupId },
    { initialNumItems: compact ? 5 : 25 }
  );

  if (status === 'LoadingFirstPage') {
    return (
      <View className="gap-sm">
        <Skeleton className="h-[40px] rounded-md" />
        <Skeleton className="h-[40px] rounded-md" />
        <Skeleton className="h-[40px] rounded-md" />
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <Text className="font-body text-body-sm text-muted">
        {t('feed.empty')}
      </Text>
    );
  }

  const labelFor = (event: (typeof results)[number]) => {
    const key = `feed.kind.${event.kind}`;
    return i18n.exists(key)
      ? t(key, {
          actor: event.actorName ?? t('feed.system'),
          note: event.note ?? '',
        })
      : t('feed.kind.generic', {
          actor: event.actorName ?? t('feed.system'),
          kind: event.kind.replaceAll('_', ' '),
        });
  };

  // Collapse adjacent identical system lines (« Confirmed automatically ✓ »
  // repeated per record) into one row with a count — same information,
  // no wall of duplicates.
  const rows: { event: (typeof results)[number]; label: string; repeat: number }[] = [];
  for (const event of results) {
    const label = labelFor(event);
    const last = rows[rows.length - 1];
    if (last && last.label === label && !event.note) {
      last.repeat += 1;
    } else {
      rows.push({ event, label, repeat: 1 });
    }
  }

  return (
    <View>
      {rows.map(({ event, label, repeat }, index) => {
        const when = new Date(event.createdAt).toLocaleDateString(
          toIntlLocale(i18n.language),
          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        );
        return (
          <View
            key={event.eventId}
            className={
              index > 0
                ? 'border-t border-border-faint py-sm'
                : 'py-sm'
            }
          >
            <Text className="font-body text-body-sm text-foreground">
              {label}
              {repeat > 1 ? ` ×${repeat}` : ''}
            </Text>
            <Text className="pt-[2px] font-body text-caption text-muted">
              {when}
              {event.note && event.kind !== 'group_created'
                ? ` · ${event.note}`
                : ''}
            </Text>
          </View>
        );
      })}
      {!compact && status === 'CanLoadMore' ? (
        <AppButton
          variant="ghost"
          size="sm"
          label={t('feed.loadMore')}
          onPress={() => loadMore(25)}
        />
      ) : null}
    </View>
  );
}
