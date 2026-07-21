import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useClerk } from '@/lib/clerk-client';
import { AppButton } from './ui/button';

/**
 * Web keeps auth behind Clerk's hosted UI. The native credentials form uses
 * Clerk's legacy resource hooks, which are intentionally excluded from the
 * public web bundle.
 */
export function CredentialsAuthForm() {
  const { t } = useTranslation();
  const clerk = useClerk();

  return (
    <View className="gap-md px-lg">
      <View className="gap-xs">
        <Text className="font-heading text-title-lg text-foreground">
          {t('auth.signInHeading')}
        </Text>
        <Text className="font-body text-body-sm text-muted">
          {t('auth.signInDesc')}
        </Text>
      </View>
      <AppButton
        label={t('auth.signInCta')}
        onPress={() => void clerk.openSignIn({})}
      />
      <AppButton
        variant="outline"
        label={t('auth.signUpCta')}
        onPress={() => void clerk.openSignUp({})}
      />
    </View>
  );
}
