import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInRight, ReduceMotion } from 'react-native-reanimated';

import { ChoiceCard } from '@/components/groups/choice-card';
import { CircleSeal } from '@/components/groups/circle-seal';
import { JoinInvitationFlow } from '@/components/groups/join-invitation-flow';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { useAppTheme } from '@/lib/theme';
import { Icon } from '@/components/ui/icon';

export default function CreateOrJoinSheet() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'choose' | 'join'>('choose');

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={62}
    >
      <View className="mb-lg flex-row justify-end">
        <SoftPressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          className="h-[44px] w-[44px] items-center justify-center rounded-full bg-surface-muted"
        >
          <Icon name="close" size="control" color={theme.textMuted} />
        </SoftPressable>
      </View>

      {mode === 'choose' ? (
        <View className="gap-lg">
          <CircleSeal progress={2} label={t('groups.entry.sealLabel')} monogram="N" />
          <View className="items-center gap-xs">
            <Text className="text-center font-heading text-display-lg text-foreground">
              {t('groups.entry.title')}
            </Text>
            <Text className="max-w-[320px] text-center font-body text-body-sm text-muted">
              {t('groups.entry.subtitle')}
            </Text>
          </View>
          <View className="gap-sm">
            <ChoiceCard
              dominant
              title={t('groups.entry.createTitle')}
              description={t('groups.entry.createBody')}
              icon="add"
              onPress={() => router.replace('/groups/new')}
              testID="entry-create"
            />
            <ChoiceCard
              title={t('groups.entry.joinTitle')}
              description={t('groups.entry.joinBody')}
              icon="invite-code"
              onPress={() => setMode('join')}
              testID="entry-join"
            />
          </View>
          <Text className="text-center font-body text-caption text-muted">
            {t('groups.entry.safety')}
          </Text>
        </View>
      ) : (
        <Animated.View entering={FadeInRight.duration(220).reduceMotion(ReduceMotion.System)}>
          <JoinInvitationFlow onClose={close} />
        </Animated.View>
      )}
    </KeyboardAwareScrollView>
  );
}
