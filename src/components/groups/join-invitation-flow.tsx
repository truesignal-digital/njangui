import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from 'react-native-heroicons/outline';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { api } from '@/lib/convex-api';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { haptics } from '@/lib/haptics';
import { extractInviteCode, inviteCodeCells } from '@/lib/invite-code';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from '@/components/ui/button';
import { CircleSeal } from '@/components/groups/circle-seal';

export function JoinInvitationFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const code = useMemo(() => extractInviteCode(value), [value]);
  const cells = useMemo(() => inviteCodeCells(value), [value]);
  const preview = useQuery(api.memberships.previewInvite, code ? { code } : 'skip');
  const joinViaCode = useMutation(api.memberships.joinViaCode);

  const waiting = submitted || preview?.viewerState === 'already_pending';

  const handleSubmit = async () => {
    if (!code || !preview || busy || preview.atCapacity || preview.viewerState === 'unavailable') {
      return;
    }
    setBusy(true);
    try {
      const result = await joinViaCode({ code });
      haptics.success();
      if (result.membershipStatus === 'active') {
        toast.success(t('groups.join.joined'));
        router.replace({
          pathname: '/groups/[groupId]',
          params: { groupId: result.groupId },
        });
      } else {
        setSubmitted(true);
      }
    } catch {
      haptics.error();
      toast.error(t('groups.join.couldNotJoin'));
    } finally {
      setBusy(false);
    }
  };

  if (waiting) {
    return (
      <Animated.View
        entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
        className="items-center gap-md pt-lg"
      >
        <CircleSeal progress={4} label={preview?.groupName ?? t('groups.join.requestSentTitle')} />
        <View className="items-center gap-xs">
          <Text className="text-center font-heading text-headline text-foreground">
            {t('groups.join.requestSentTitle')}
          </Text>
          <Text className="max-w-[320px] text-center font-body text-body-sm text-muted">
            {t('groups.join.requestSentBody')}
          </Text>
        </View>
        <View className="w-full flex-row items-center gap-sm rounded-2xl border border-success bg-success-bg p-md">
          <ClockIcon size={22} color={theme.successDark} />
          <View className="min-w-0 flex-1">
            <Text className="font-body-semi text-body text-foreground">
              {preview?.groupName}
            </Text>
            <Text className="font-body text-body-sm text-muted">
              {t('groups.join.waitingStatus')}
            </Text>
          </View>
        </View>
        <AppButton variant="outline" label={t('common.close')} className="w-full" onPress={onClose} />
      </Animated.View>
    );
  }

  const isInvalid = code !== null && preview === null;
  const canJoin =
    preview !== undefined &&
    preview !== null &&
    !preview.atCapacity &&
    preview.viewerState !== 'unavailable';

  return (
    <View className="gap-lg">
      <View className="gap-xs">
        <Text className="font-heading text-headline text-foreground">
          {t('groups.join.title')}
        </Text>
        <Text className="font-body text-body-sm text-muted">{t('groups.join.desc')}</Text>
      </View>

      <View className="gap-xs">
        <Text className="font-body-medium text-label text-foreground">
          {t('groups.join.codeLabel')}
        </Text>
        <Pressable
          accessibilityRole="none"
          onPress={() => inputRef.current?.focus()}
          className="relative flex-row gap-xs"
        >
          {cells.map((character, index) => (
            <View
              key={index}
              accessible={false}
              className={
                character
                  ? 'h-[54px] flex-1 items-center justify-center rounded-xl border border-accent bg-accent-faint'
                  : 'h-[54px] flex-1 items-center justify-center rounded-xl border border-border bg-surface'
              }
              style={{ borderCurve: 'continuous' }}
            >
              <Text className="font-mono-bold text-title text-foreground">{character}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            accessibilityLabel={t('groups.join.codeLabel')}
            value={value}
            onChangeText={setValue}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            caretHidden
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
            style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent' }}
            testID="join-code-input"
          />
        </Pressable>
        <Text className="font-body text-caption text-muted">
          {t('groups.join.pasteHint')}
        </Text>
      </View>

      {code && preview === undefined ? (
        <View className="min-h-[92px] items-center justify-center rounded-2xl bg-surface-muted">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : null}

      {isInvalid ? (
        <Animated.Text
          entering={FadeIn.duration(100).reduceMotion(ReduceMotion.System)}
          className="font-body text-body-sm text-destructive"
        >
          {t('groups.join.invalid')}
        </Animated.Text>
      ) : null}

      {preview ? (
        <Animated.View
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          className="gap-md rounded-2xl border border-border-subtle bg-surface p-lg"
          style={{ borderCurve: 'continuous', ...theme.shadow('card') }}
        >
          <View className="flex-row items-center gap-md">
            <View className="h-[48px] w-[48px] items-center justify-center rounded-full bg-success-bg">
              <UserGroupIcon size={24} color={theme.successDark} />
            </View>
            <View className="min-w-0 flex-1 gap-[2px]">
              <Text className="font-heading text-title-lg text-foreground">
                {preview.groupName}
              </Text>
              <Text className="font-body text-body-sm text-muted">
                {t('groups.join.memberCount', { count: preview.memberCount })}
              </Text>
            </View>
            <ShieldCheckIcon size={22} color={theme.successDark} />
          </View>
          <View className="h-px bg-border-faint" />
          <Text className="font-body text-body-sm text-muted">
            {t('groups.join.previewSummary', {
              schedule: t(`groups.wizard.schedule${preview.schedule[0].toUpperCase()}${preview.schedule.slice(1)}`),
              amount: formatCurrencyXAF(preview.contributionAmount),
            })}
          </Text>
          <View className="flex-row items-start gap-xs rounded-xl bg-success-bg p-sm">
            <CheckCircleIcon size={18} color={theme.successDark} />
            <Text className="flex-1 font-body text-body-sm text-muted">
              {t('groups.join.previewSafety')}
            </Text>
          </View>
          {preview.atCapacity ? (
            <Text className="font-body-semi text-body-sm text-destructive">
              {t('groups.join.full')}
            </Text>
          ) : preview.viewerState === 'unavailable' ? (
            <Text className="font-body-semi text-body-sm text-destructive">
              {t('groups.join.unavailable')}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      <AppButton
        label={
          busy
            ? t('groups.join.submitting')
            : preview?.viewerState === 'already_active'
              ? t('groups.join.openGroup')
              : t('groups.join.askToJoin')
        }
        loading={busy}
        disabled={!canJoin}
        onPress={() => void handleSubmit()}
      />
    </View>
  );
}
