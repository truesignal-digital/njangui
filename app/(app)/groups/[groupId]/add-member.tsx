import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
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
  if (/^\d{9}$/.test(cleaned)) return `+${'237'}${cleaned}`;
  return cleaned;
}

type Mode = 'username' | 'phone';

/**
 * Treasurer/president adds a member (modal over the group home). Two kinds:
 * an APP member found by their unique username (exact match — they get a
 * push/email that they were added), or a feature-phone member (docs/01:
 * membership without userId — phone required, the ledger is kept for them).
 */
export default function AddMemberModal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [mode, setMode] = useState<Mode>('username');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const addFeaturePhoneMember = useMutation(api.memberships.addFeaturePhoneMember);
  const addMemberByUsername = useMutation(api.memberships.addMemberByUsername);
  const lookup = username.trim().toLowerCase();
  const found = useQuery(
    api.users.findByUsername,
    lookup.length >= 3 ? { username: lookup } : 'skip'
  );

  const canSubmitPhone = name.trim().length > 0 && phone.trim().length >= 9 && !busy;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleAddByUsername = async () => {
    if (!found || !groupId || busy) return;
    setBusy(true);
    try {
      await addMemberByUsername({
        groupId: groupId as Id<'groups'>,
        username: found.username,
      });
      haptics.success();
      toast.success(t('groups.detail.memberAddedToast', { name: found.name || found.username }));
      close();
    } catch {
      haptics.error();
      toast.error(t('common.error'));
      setBusy(false);
    }
  };

  const handleSubmitPhone = async () => {
    if (!canSubmitPhone || !groupId) return;
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

  const segment = (value: Mode, label: string) => (
    <Pressable
      key={value}
      accessibilityRole="button"
      onPress={() => setMode(value)}
      className={
        mode === value
          ? 'flex-1 items-center rounded-pill bg-surface px-md py-sm'
          : 'flex-1 items-center rounded-pill px-md py-sm'
      }
      testID={`add-member-mode-${value}`}
    >
      <Text
        className={
          mode === value
            ? 'font-body-semi text-body-sm text-foreground'
            : 'font-body-medium text-body-sm text-muted'
        }
      >
        {label}
      </Text>
    </Pressable>
  );

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
            {t('groups.detail.addMember')}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {mode === 'username'
              ? t('groups.detail.addByUsernameDesc')
              : t('groups.detail.addMemberDesc')}
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

      <View className="mb-lg flex-row rounded-pill bg-surface-muted p-[3px]">
        {segment('username', t('groups.detail.addByUsername'))}
        {segment('phone', t('groups.detail.addByPhone'))}
      </View>

      {mode === 'username' ? (
        <View className="gap-md">
          <TextField
            label={t('auth.usernameLabel')}
            value={username}
            onChangeText={setUsername}
            placeholder="ex. mama-ngozi"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            testID="add-member-username"
          />
          {lookup.length >= 3 ? (
            found ? (
              <View className="flex-row items-center gap-md rounded-xl border border-border-subtle bg-surface p-lg">
                <View className="h-[40px] w-[40px] items-center justify-center rounded-pill bg-accent-faint">
                  <Text className="font-body-semi text-body text-accent">
                    {(found.name || found.username).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-body-semi text-body text-foreground">
                    {found.name || found.username}
                  </Text>
                  <Text className="font-body text-body-sm text-muted">
                    @{found.username}
                  </Text>
                </View>
              </View>
            ) : found === null ? (
              <Text className="font-body text-body-sm text-muted">
                {t('groups.detail.usernameNotFound')}
              </Text>
            ) : null
          ) : null}
          <AppButton
            label={busy ? t('groups.detail.adding') : t('groups.detail.add')}
            loading={busy}
            disabled={!found || busy}
            onPress={() => void handleAddByUsername()}
            testID="add-member-submit-username"
          />
        </View>
      ) : (
        <View className="gap-md">
          <TextField
            label={t('groups.detail.memberName')}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.detail.memberNamePlaceholder')}
            autoComplete="off"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextField
            label={t('groups.detail.memberPhone')}
            prefix="+237"
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/[^\d]/g, ''))}
            placeholder={t('groups.detail.memberPhonePlaceholder')}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmitPhone()}
          />
          <AppButton
            label={busy ? t('groups.detail.adding') : t('groups.detail.add')}
            loading={busy}
            disabled={!canSubmitPhone}
            onPress={() => void handleSubmitPhone()}
          />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
