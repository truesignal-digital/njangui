import {
  RefreshControl,
  SectionList,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttentionRow } from '@/components/attention/attention-card';
import { WaitingShelf } from '@/components/attention/waiting-shelf';
import { Skeleton } from '@/components/skeleton';
import { Icon } from '@/components/ui/icon';
import { StatusBarCover } from '@/components/ui/status-bar-cover';
import { useAttention } from '@/hooks/use-attention';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { openAttentionDestination } from '@/lib/attention-navigation';
import {
  presentAttentionAction,
  type AttentionAction,
} from '@/lib/attention-presentation';
import { useAuth } from '@/lib/clerk-client';
import { useAppTheme } from '@/lib/theme';

/** The complete executable queue. Waiting is a separate, collapsed shelf. */
export default function ActionsScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { data, isLoading } = useAttention();
  const { refreshing, onRefresh } = usePullRefresh();

  if (isLoaded && !isSignedIn) return <Redirect href="/sign-in" />;

  const screenPadding = {
    paddingTop: insets.top + theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  if (!isLoaded || isLoading || data === undefined) {
    return (
      <View className="flex-1 bg-background" style={screenPadding}>
        <Skeleton className="h-[36px] w-[180px]" />
        <Skeleton className="mt-xs h-[18px] w-[280px]" />
        <View className="mt-xl gap-sm">
          <Skeleton className="h-[96px] rounded-xl" />
          <Skeleton className="h-[96px] rounded-xl" />
          <Skeleton className="h-[96px] rounded-xl" />
        </View>
      </View>
    );
  }

  const groupedActions = groupActions(data.actions);

  return (
    <View className="flex-1 bg-background">
      <SectionList
        sections={groupedActions}
        keyExtractor={(action) => action.id}
        renderItem={({ item }) => (
          <AttentionRow
            model={presentAttentionAction(item, t, i18n.language)}
            onPress={() => openAttentionDestination(item.destination)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center justify-between bg-background pb-sm pt-lg">
            <View className="flex-row items-center gap-xs">
              <View className="h-[8px] w-[8px] rounded-full bg-success" />
              <Text className="font-body-semi text-body-sm text-foreground">
                {section.title}
              </Text>
            </View>
            <Text className="font-body text-caption text-muted">
              {t('attention.actions.groupCount', { count: section.data.length })}
            </Text>
          </View>
        )}
        contentContainerStyle={screenPadding}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={
          <View className="flex-row items-end justify-between gap-lg pb-sm">
            <Text className="max-w-[55%] font-heading text-display-lg text-foreground">
              {t('attention.actions.title')}
            </Text>
            <Text className="max-w-[42%] pb-[3px] font-body text-caption text-muted">
              {t('attention.actions.subtitle')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-sm rounded-2xl border border-success bg-success-bg p-xl">
            <Icon name="confirmed" size="emphasis" color={theme.successDark} />
            <Text className="text-center font-heading text-headline text-foreground">
              {t('attention.actions.emptyTitle')}
            </Text>
            <Text className="text-center font-body text-body-sm text-muted">
              {t('attention.actions.emptyBody')}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View className="pt-lg">
            <WaitingShelf
              waiting={data.waiting}
              t={t}
              onOpen={(waiting) => {
                if (waiting.destination) {
                  openAttentionDestination(waiting.destination);
                }
              }}
            />
            {data.truncated ? (
              <Text className="pt-lg font-body text-caption text-warning-dark">
                {t('attention.actions.truncated')}
              </Text>
            ) : null}
          </View>
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
      <StatusBarCover />
    </View>
  );
}

function ListSeparator() {
  return <View className="h-xs" />;
}

type ActionSection = {
  key: string;
  title: string;
  data: AttentionAction[];
};

function groupActions(actions: AttentionAction[]): ActionSection[] {
  const sections = new Map<string, ActionSection>();
  for (const action of actions) {
    const key = action.group.groupId;
    const existing = sections.get(key);
    if (existing) {
      existing.data.push(action);
    } else {
      sections.set(key, {
        key,
        title: action.group.name,
        data: [action],
      });
    }
  }
  return [...sections.values()];
}
