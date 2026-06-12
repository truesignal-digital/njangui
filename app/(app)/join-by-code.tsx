import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { CheckCircleIcon, XMarkIcon } from 'react-native-heroicons/outline';
import { toast } from 'sonner-native';

import { api } from '../../src/lib/convex-api';
import { haptics } from '../../src/lib/haptics';
import { useAppTheme, useShadow } from '../../src/lib/theme';
import { AppButton } from '../../src/components/ui/button';
import { TextField } from '../../src/components/ui/text-field';

/**
 * Accepts a pasted invite message/deep link (…/j/K7M2PQ or njangi://j/K7M2PQ)
 * or a bare code. Codes are 6 chars, uppercase, no-confusables alphabet
 * (docs/01).
 */
function extractInviteCode(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/j\/([A-Za-z0-9]{4,10})/);
  const candidate = (
    fromLink ? fromLink[1] : (trimmed.split(/[\s/]+/).pop() ?? '')
  ).toUpperCase();
  return /^[A-Z0-9]{6}$/.test(candidate) ? candidate : null;
}

/**
 * Join-by-invite-code modal (docs/05 Week 1 inventory: invite code join).
 * Joining lands in `pending_approval` unless the phone matches a pre-added
 * membership (docs/03 B10) — both outcomes are handled here.
 */
export default function JoinByCodeModal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const shadow = useShadow();

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const joinViaCode = useMutation(api.memberships.joinViaCode);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleSubmit = async () => {
    if (busy) return;
    const inviteCode = extractInviteCode(value);
    if (!inviteCode) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    try {
      const result = await joinViaCode({ code: inviteCode });

      if (result.membershipStatus === 'active') {
        // Pre-added by phone — straight into the group.
        haptics.success();
        toast.success(t('groups.join.joined'));
        router.replace({
          pathname: '/groups/[groupId]',
          params: { groupId: result.groupId },
        });
      } else {
        // pending_approval (closed trust circle — president/treasurer must approve)
        haptics.success();
        setRequestSent(true);
      }
    } catch {
      haptics.error();
      setInvalid(true);
    } finally {
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
      {requestSent ? (
        <View
          className="mt-xl items-center gap-sm rounded-xl border border-border-subtle bg-surface px-xl py-[28px]"
          style={shadow('card')}
        >
          <CheckCircleIcon size={36} color={theme.success} />
          <Text className="text-center font-body-semi text-title text-foreground">
            {t('groups.join.requestSentTitle')}
          </Text>
          <Text className="text-center font-body text-body-sm text-muted">
            {t('groups.join.requestSentBody')}
          </Text>
          <AppButton label={t('common.close')} className="mt-sm self-stretch" onPress={close} />
        </View>
      ) : (
        <>
          <View className="flex-row items-start justify-between gap-sm pb-lg">
            <View className="min-w-0 flex-1 gap-xs">
              <Text className="font-heading text-headline text-foreground">
                {t('groups.join.title')}
              </Text>
              <Text className="font-body text-body-sm text-muted">{t('groups.join.desc')}</Text>
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
              label={t('groups.join.codeLabel')}
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setInvalid(false);
              }}
              placeholder={t('groups.join.placeholder')}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              error={invalid ? t('groups.join.invalid') : null}
              className="font-mono text-title tracking-[2px]"
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit()}
            />
            <AppButton
              label={busy ? t('groups.join.submitting') : t('groups.join.submit')}
              loading={busy}
              disabled={value.trim().length === 0}
              onPress={() => void handleSubmit()}
            />
          </View>
        </>
      )}
    </KeyboardAwareScrollView>
  );
}
