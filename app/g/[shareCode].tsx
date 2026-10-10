import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NjangiMark } from '@/components/brand/njangi-mark';
import { getPublicShareCodeCandidate } from '@/lib/public-share-code';
import { useAppTheme } from '@/lib/theme';
import { Icon } from '@/components/ui/icon';

/**
 * Signed-out capability route for WhatsApp contribution links.
 *
 * This first slice deliberately renders only a generic unavailable state. The
 * Contribution Group milestone will connect it to one narrow public Convex
 * query whose response is safe for anyone holding the revocable share code.
 */
export default function PublicGroupScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { shareCode: routeShareCode } = useLocalSearchParams<{
    shareCode?: string | string[];
  }>();
  const shareCode = getPublicShareCodeCandidate(routeShareCode);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        minHeight: '100%',
        paddingTop: insets.top + theme.spacing.xl,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Stack.Screen
        options={{ title: t('publicGroup.pageTitle'), headerShown: false }}
      />
      <View className="w-full max-w-[560px] self-center">
        <View className="mb-xxl flex-row items-center gap-sm">
          <NjangiMark size={24} accessibilityLabel={t('publicGroup.brand')} />
          <Text className="font-heading text-title text-foreground">
            {t('publicGroup.brand')}
          </Text>
        </View>

        <View className="self-start rounded-pill bg-success-bg px-sm py-xs">
          <Text className="font-body-semi text-caption text-success-dark">
            {t('publicGroup.eyebrow')}
          </Text>
        </View>

        <Text className="mt-md font-heading text-display-lg text-foreground">
          {shareCode
            ? t('publicGroup.unavailableTitle')
            : t('publicGroup.invalidTitle')}
        </Text>
        <Text className="mt-sm font-body text-body text-muted">
          {shareCode
            ? t('publicGroup.unavailableBody')
            : t('publicGroup.invalidBody')}
        </Text>

        <View className="mt-xl flex-row gap-sm rounded-2xl border border-border-subtle bg-surface p-md">
          <Icon name="custody" size="emphasis" color={theme.successDark} />
          <View className="flex-1 gap-xs">
            <Text className="font-body-semi text-label text-foreground">
              {t('publicGroup.safetyTitle')}
            </Text>
            <Text className="font-body text-body-sm text-muted">
              {t('publicGroup.safetyBody')}
            </Text>
          </View>
        </View>

        <Text className="mt-xl text-center font-body text-caption text-muted">
          {t('publicGroup.footer')}
        </Text>
      </View>
    </ScrollView>
  );
}
