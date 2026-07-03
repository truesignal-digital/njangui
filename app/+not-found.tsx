import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/components/ui/button';

/*
 * Catch-all for stale push deep links and malformed URLs — the routes they
 * point at may be gone (deleted group, revoked membership) long after the
 * notification was sent.
 */
export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 items-center justify-center gap-lg bg-surface px-xl">
        <Text className="font-heading text-title text-foreground">{t('notFound.title')}</Text>
        <Text className="text-center font-body text-body text-muted">
          {t('notFound.body')}
        </Text>
        <AppButton label={t('notFound.cta')} onPress={() => router.replace('/')} />
      </View>
    </>
  );
}
