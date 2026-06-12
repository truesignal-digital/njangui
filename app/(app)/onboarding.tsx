import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { toast } from 'sonner-native';

import { api } from '../../src/lib/convex-api';
import { useAuth } from '../../src/lib/clerk-client';
import { haptics } from '../../src/lib/haptics';
import { useAppTheme, useShadow } from '../../src/lib/theme';
import { LanguageToggle } from '../../src/components/language-toggle';
import { Skeleton } from '../../src/components/skeleton';
import { AppButton } from '../../src/components/ui/button';
import { TextField } from '../../src/components/ui/text-field';

/**
 * Post-auth onboarding (docs/03 B10): asks exactly one thing — the name —
 * then routes home. Language confirm is the FR/EN toggle in the header.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const shadow = useShadow();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const updateMyName = useMutation(api.users.updateMyName);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefill for returning users — but never with the bare phone number.
  useEffect(() => {
    if (!currentUser) return;
    const existing = currentUser.name.trim();
    if (existing && existing !== currentUser.phone) {
      setName((prev) => (prev ? prev : existing));
    }
  }, [currentUser]);

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  const goHome = () => {
    router.replace('/');
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await updateMyName({ name: trimmed });
      haptics.success();
      goHome();
    } catch {
      haptics.error();
      toast.error(t('common.error'));
      setBusy(false);
    }
  };

  const loading = !isLoaded || (isSignedIn && currentUser === undefined);

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.xl,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={62}
    >
      <View className="items-end pb-lg">
        <LanguageToggle />
      </View>

      <View className="gap-xs pb-xl">
        <Text className="font-heading text-display-lg text-foreground">
          {t('onboarding.title')}
        </Text>
        <Text className="font-body text-body text-muted">{t('onboarding.desc')}</Text>
      </View>

      {loading ? (
        <View className="gap-md">
          <Skeleton className="h-[52px] rounded-lg" />
          <Skeleton className="h-[52px] rounded-lg" />
        </View>
      ) : (
        <View
          className="gap-md rounded-xl border border-border-subtle bg-surface p-lg"
          style={shadow('card')}
        >
          <TextField
            label={t('onboarding.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('onboarding.namePlaceholder')}
            autoComplete="name"
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmit()}
          />
          <AppButton
            label={t('onboarding.submit')}
            loading={busy}
            disabled={name.trim().length === 0}
            onPress={() => void handleSubmit()}
          />
          <Pressable
            accessibilityRole="button"
            onPress={goHome}
            className="min-h-[44px] items-center justify-center"
          >
            <Text className="font-body text-body-sm text-muted">{t('onboarding.skip')}</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
