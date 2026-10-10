import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Id } from '@/lib/convex-api';
import { useAppTheme } from '@/lib/theme';
import { ActivityFeed } from '@/components/groups/activity-feed';
import { NjangiMark } from '@/components/brand/njangi-mark';
import { Icon } from '@/components/ui/icon';

/**
 * Full group activity — the complete immutable who-did-what-when (trust
 * decision 6: the ledger is the product). The group screen shows a 5-item
 * preview; this page paginates through everything.
 */
export default function GroupActivityScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  if (!groupId) return null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center gap-xs pb-lg">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <Icon name="back" size="control" color={theme.textMuted} />
        </Pressable>
        <Text className="font-heading text-headline text-foreground">
          {t('feed.fullTitle')}
        </Text>
        <View className="ml-auto">
          <NjangiMark size={32} color={theme.successDark} />
        </View>
      </View>
      <View className="rounded-xl border border-border-subtle bg-surface p-lg">
        <ActivityFeed groupId={groupId as Id<'groups'>} />
      </View>
    </ScrollView>
  );
}
