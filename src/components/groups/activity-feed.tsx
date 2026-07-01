import { Text, View } from 'react-native';
import { usePaginatedQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api, type Id } from '../../lib/convex-api';
import { AppButton } from '../ui/button';
import { Skeleton } from '../skeleton';

/**
 * Group activity feed (05 M7, Slice 7) — immutable who-did-what-when.
 * Kind → copy mapping lives in the `feed.*` locale namespace with a
 * generic fallback so an unmapped kind renders honestly instead of
 * disappearing. Auto-events (no actor) render without a name.
 */
export function ActivityFeed({ groupId }: { groupId: Id<'groups'> }) {
  const { t, i18n } = useTranslation();
  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.listGroupFeed,
    { groupId },
    { initialNumItems: 15 }
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

  return (
    <View>
      {results.map((event, index) => {
        const key = `feed.kind.${event.kind}`;
        const label = i18n.exists(key)
          ? t(key, {
              actor: event.actorName ?? t('feed.system'),
              note: event.note ?? '',
            })
          : t('feed.kind.generic', {
              actor: event.actorName ?? t('feed.system'),
              kind: event.kind.replaceAll('_', ' '),
            });
        const when = new Date(event.createdAt).toLocaleDateString(
          i18n.language === 'fr' ? 'fr-FR' : 'en-GB',
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
      {status === 'CanLoadMore' ? (
        <AppButton
          variant="ghost"
          size="sm"
          label={t('feed.loadMore')}
          onPress={() => loadMore(15)}
        />
      ) : null}
    </View>
  );
}
