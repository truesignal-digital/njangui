import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { XMarkIcon } from 'react-native-heroicons/outline';
import { toast } from 'sonner-native';

import { api, type Id } from '../../../../src/lib/convex-api';
import { haptics } from '../../../../src/lib/haptics';
import { useAppTheme } from '../../../../src/lib/theme';
import { AppButton } from '../../../../src/components/ui/button';
import { TextField } from '../../../../src/components/ui/text-field';

/** Best-effort E.164 for Cameroon numbers (9 digits starting with 6 → +237…). */
function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('237')) return `+${cleaned}`;
  if (/^\d{9}$/.test(cleaned)) return `+237${cleaned}`;
  return cleaned;
}

/**
 * Treasurer/president adds a feature-phone member (docs/01: membership
 * without userId — phone required; docs/05 Week 1 inventory). Direct add
 * skips approval and creates the membership `active`. Presented as a modal
 * route over the group home.
 */
export default function AddMemberModal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const addFeaturePhoneMember = useMutation(api.memberships.addFeaturePhoneMember);

  const canSubmit = name.trim().length > 0 && phone.trim().length >= 9 && !busy;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleSubmit = async () => {
    if (!canSubmit || !groupId) return;
    setBusy(true);
    try {
      await addFeaturePhoneMember({
        groupId: groupId as Id<'groups'>,
        name: name.trim(),
        phone: normalizePhone(phone),
      });
      haptics.success();
      toast.success(t('groups.detail.memberAddedToast', { name: name.trim() }));
      close();
    } catch {
      haptics.error();
      toast.error(t('common.error'));
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, theme.spacing.lg),
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={62}
    >
      <View className="flex-row items-start justify-between gap-sm pb-lg">
        <View className="min-w-0 flex-1 gap-xs">
          <Text className="font-heading text-headline text-foreground">
            {t('groups.detail.addMemberTitle')}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {t('groups.detail.addMemberDesc')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <XMarkIcon size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      <View className="gap-md">
        <TextField
          label={t('groups.detail.memberName')}
          value={name}
          onChangeText={setName}
          placeholder={t('groups.detail.memberNamePlaceholder')}
          autoComplete="off"
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
        />
        <TextField
          label={t('groups.detail.memberPhone')}
          prefix="+237"
          value={phone}
          onChangeText={setPhone}
          placeholder={t('groups.detail.memberPhonePlaceholder')}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
        />
        <AppButton
          label={busy ? t('groups.detail.adding') : t('groups.detail.add')}
          loading={busy}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}
