import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/convex-api';
import { useAuth, useClerk } from '@/lib/clerk-client';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from '@/components/ui/button';
import { LanguageToggle } from '@/components/language-toggle';
import { Skeleton } from '@/components/skeleton';
import { useThemePreference, type ThemePreference } from '@/lib/theme-preference';
import { AppearanceSelector } from '@/components/native/appearance-selector';
import { NjangiMark } from '@/components/brand/njangi-mark';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { Icon } from '@/components/ui/icon';

/**
 * Profile screen — minimal (Slice 3 stub; the fuller profile is roadmap #13):
 * who am I, language preference, sign out, and the custody line the product
 * leads with everywhere. Every personal field carries a visible label —
 * position-only meaning fails VoiceOver and the pilot review.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { preference, mode, setPreference } = useThemePreference();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useClerk();
  const me = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const [busy, setBusy] = useState(false);
  const appearanceOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('profile.themeSystem') },
    { value: 'light', label: t('profile.themeLight') },
    { value: 'dark', label: t('profile.themeDark') },
  ];

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <ScrollView
      className="flex-1 bg-background px-lg"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xl,
      }}
    >
      <View className="gap-lg">
        {me === undefined ? (
          <Skeleton className="h-[164px] rounded-2xl" />
        ) : me ? (
          <View
            className="gap-lg overflow-hidden rounded-2xl bg-accent-hero p-lg"
            style={{ ...theme.shadow('card'), borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-md">
              <View className="h-[64px] w-[64px] items-center justify-center rounded-full bg-highlight">
                <Text className="font-heading text-title-lg text-highlight-fg">
                  {initials(me.name || me.username || 'N')}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="font-heading text-title-lg text-inverted"
                >
                  {me.name || '—'}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-body text-caption text-inverted-muted"
                >
                  {me.username ? `@${me.username}` : me.email || '—'}
                </Text>
              </View>
              <NjangiMark size={52} color={theme.textInvertedMuted} />
            </View>
            <View className="flex-row flex-wrap gap-xs">
              {me.email ? (
                <IdentityPill label={me.email} />
              ) : null}
              {me.phone ? <IdentityPill label={me.phone} /> : null}
            </View>
            {!me.email && !me.phone ? (
              <LabeledField
                label={t('profile.emailLabel')}
                value={t('profile.notSet')}
                inverted
              />
            ) : null}
          </View>
        ) : null}

        <View className="gap-xs">
          <Text className="font-body-semi text-overline uppercase text-muted">
            {t('profile.appearance')}
          </Text>
          <View
            className="gap-md rounded-2xl border border-border-subtle bg-surface p-lg"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-start gap-sm">
              <View className="h-[40px] w-[40px] items-center justify-center rounded-full bg-success-bg">
                <NjangiMark size={24} color={theme.successDark} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-body-semi text-title text-foreground">
                  {t('profile.appearance')}
                </Text>
                <Text className="font-body text-caption text-muted">
                  {t('profile.appearanceDescription')}
                </Text>
              </View>
            </View>
            <AppearanceSelector
              value={preference}
              options={appearanceOptions}
              colorScheme={mode}
              accentColor={theme.accent}
              onChange={setPreference}
            />
          </View>
        </View>

        <View className="gap-xs">
          <Text className="font-body-semi text-overline uppercase text-muted">
            {t('profile.preferences')}
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
            <PreferenceRow
              icon={
                <Icon name="calendar" size="control" color={theme.successDark} />
              }
              title={t('calendar.title')}
              detail={t('profile.calendarDescription')}
              onPress={() => router.push('/calendar')}
            />
            <View className="mx-md h-px bg-border-faint" />
            <View className="gap-sm p-md">
              <View className="flex-row items-center gap-sm">
                <View className="h-[40px] w-[40px] items-center justify-center rounded-full bg-success-bg">
                  <Icon name="language" size="control" color={theme.successDark} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-body-semi text-body text-foreground">
                    {t('profile.language')}
                  </Text>
                  <Text className="font-body text-caption text-muted">
                    {t('profile.languageDescription')}
                  </Text>
                </View>
              </View>
              <LanguageToggle />
            </View>
          </View>
        </View>

        <Text className="text-center font-body text-caption text-placeholder">
          {t('auth.custodyNote')}
        </Text>

        <AppButton
          variant="outline"
          label={t('profile.signOut')}
          loading={busy}
          disabled={busy}
          testID="sign-out"
          onPress={() => void handleSignOut()}
        />
      </View>
    </ScrollView>
  );
}

function LabeledField({
  label,
  value,
  emphasized = false,
  inverted = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  inverted?: boolean;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text
        className={
          inverted
            ? 'font-body text-caption text-inverted-muted'
            : 'font-body text-caption text-muted'
        }
      >
        {label}
      </Text>
      <Text
        className={
          inverted
            ? 'font-body text-body-sm text-inverted'
            : emphasized
            ? 'font-body-semi text-title text-foreground'
            : 'font-body text-body-sm text-foreground'
        }
      >
        {value}
      </Text>
    </View>
  );
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'N';
}

function IdentityPill({ label }: { label: string }) {
  return (
    <View className="max-w-full rounded-pill bg-scrim px-sm py-xs">
      <Text numberOfLines={1} className="font-body-medium text-caption text-inverted">
        {label}
      </Text>
    </View>
  );
}

function PreferenceRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      className="min-h-[72px] flex-row items-center gap-sm px-md py-sm active:bg-surface-muted"
      onPress={onPress}
      scaleOnPress={false}
    >
      <View className="h-[40px] w-[40px] items-center justify-center rounded-full bg-success-bg">
        {icon}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-body-semi text-body text-foreground">{title}</Text>
        <Text numberOfLines={1} className="font-body text-caption text-muted">
          {detail}
        </Text>
      </View>
      <Icon name="chevron" size="metadata" color={theme.textPlaceholder} />
    </SoftPressable>
  );
}
