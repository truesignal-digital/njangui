import { ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AttentionPrimaryCard,
  AttentionRow,
} from '@/components/attention/attention-card';
import { WaitingShelf } from '@/components/attention/waiting-shelf';
import { Skeleton } from '@/components/skeleton';
import { AppButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { StatusBarCover } from '@/components/ui/status-bar-cover';
import { useAttention } from '@/hooks/use-attention';
import { useAuth } from '@/lib/clerk-client';
import { openAttentionDestination } from '@/lib/attention-navigation';
import {
  presentAttentionAction,
  waitingFactCount,
} from '@/lib/attention-presentation';
import { toIntlLocale } from '@/lib/app-locale';
import { useAppTheme } from '@/lib/theme';
import { ICON_SIZE } from '@/lib/icons';

/**
 * Today answers one question: what can I move forward now? Waiting and the
 * next meeting stay visible but cannot compete with the primary action.
 */
export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { data, currentUser, isLoading } = useAttention();

  if (isLoaded && !isSignedIn) return <Redirect href="/sign-in" />;

  if (!isLoaded || isLoading || data === undefined) {
    return (
      <View
        className="flex-1 bg-background px-lg"
        style={{ paddingTop: insets.top + theme.spacing.lg }}
      >
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-[36px] w-[150px]" />
          <Skeleton className="h-[42px] w-[42px] rounded-full" />
        </View>
        <Skeleton className="mt-xs h-[18px] w-[280px]" />
        <Skeleton className="mt-xl h-[240px] rounded-2xl" />
        <Skeleton className="mt-lg h-[64px] rounded-xl" />
      </View>
    );
  }

  const primary = data.actions[0] ?? null;
  const primaryModel = primary
    ? presentAttentionAction(primary, t, i18n.language)
    : null;
  const secondaryActions = data.actions.slice(1, 3);
  const moreCount = Math.max(data.actions.length - 3, 0);
  const userName = currentUser?.name?.trim() || 'Njangi';
  const firstName = userName.split(/\s+/)[0];
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12
      ? 'attention.today.greetingMorning'
      : hour < 18
        ? 'attention.today.greetingAfternoon'
        : 'attention.today.greetingEvening';
  const waitingCount = waitingFactCount(data.waiting);
  const nextEventShort = data.nextEvent
    ? new Date(data.nextEvent.dueAt).toLocaleDateString(
        toIntlLocale(i18n.language),
        { weekday: 'short' }
      )
    : null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: 17,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between gap-md">
          <View className="min-w-0 flex-1">
            <Text className="font-body text-caption text-muted">
              {t(greetingKey, { name: firstName })}
            </Text>
            <Text className="max-w-[300px] pt-[3px] font-heading text-display text-foreground">
              {t('attention.today.collectiveTitle')}
            </Text>
          </View>
          <SoftPressable
            accessibilityRole="button"
            accessibilityLabel={t('attention.today.profileAccessibility')}
            onPress={() => router.push('/profile')}
            className="mt-xs h-[40px] w-[40px] items-center justify-center rounded-full bg-accent active:opacity-80"
          >
            <Text className="font-mono-semi text-caption text-inverted">
              {initials || 'N'}
            </Text>
          </SoftPressable>
        </View>

        <View className="flex-row flex-wrap gap-xs pt-md">
          <SummaryPill
            label={t('attention.today.needsYou', { count: data.actions.length })}
            tone="warm"
          />
          {waitingCount > 0 ? (
            <SummaryPill
              label={t('attention.today.withOthers', { count: waitingCount })}
            />
          ) : null}
          {nextEventShort ? (
            <SummaryPill
              label={t('attention.today.meetShort', { date: nextEventShort })}
            />
          ) : null}
        </View>

        <Text className="pb-xs pt-md font-body-semi text-overline uppercase text-muted">
          {t('attention.today.primary')}
        </Text>

        {primary && primaryModel ? (
          <AttentionPrimaryCard
            model={primaryModel}
            onPress={() => openAttentionDestination(primary.destination)}
          />
        ) : (
          <View
            className="gap-sm rounded-2xl border border-success bg-success-bg p-lg"
            style={{ borderCurve: 'continuous' }}
          >
            <Icon name="confirmed" size={ICON_SIZE.emphasis} color={theme.successDark} />
            <Text className="font-heading text-headline text-foreground">
              {t('attention.today.allClearTitle')}
            </Text>
            <Text className="font-body text-body-sm text-muted">
              {t('attention.today.allClearBody')}
            </Text>
          </View>
        )}

        {secondaryActions.length > 0 ? (
          <View className="gap-xs pt-md">
            <Text className="pb-[2px] font-body-semi text-overline uppercase text-muted">
              {t('attention.today.secondary')}
            </Text>
            {secondaryActions.map((action) => (
              <AttentionRow
                key={action.id}
                model={presentAttentionAction(action, t, i18n.language)}
                onPress={() => openAttentionDestination(action.destination)}
                compact
              />
            ))}
          </View>
        ) : null}

        {data.actions.length > 1 ? (
          <SoftPressable
            accessibilityRole="button"
            onPress={() => router.push('/inbox')}
            scaleOnPress={false}
            className="min-h-[38px] flex-row items-center gap-xs self-start active:opacity-70"
          >
            <Text className="font-body-semi text-body-sm text-accent">
              {moreCount > 0
                ? t('attention.today.moreActions', { count: moreCount })
                : t('attention.today.seeAllActions')}
            </Text>
            <Icon name="next" size={ICON_SIZE.metadata} color={theme.accent} />
          </SoftPressable>
        ) : null}

        <View className="pt-xs">
          <WaitingShelf
            waiting={data.waiting}
            t={t}
            onOpen={(waiting) => {
              if (waiting.destination) {
                openAttentionDestination(waiting.destination);
              }
            }}
          />
        </View>

        {data.truncated ? (
          <Text className="pt-lg font-body text-caption text-warning-dark">
            {t('attention.today.truncated')}
          </Text>
        ) : null}

        {!primary && data.waiting.length === 0 && data.nextEvent === null ? (
          <View className="pt-lg">
            <AppButton
              variant="outline"
              label={t('tabs.group')}
              onPress={() => router.push('/group')}
            />
          </View>
        ) : null}
      </ScrollView>
      <StatusBarCover />
    </View>
  );
}

function SummaryPill({
  label,
  tone = 'sage',
}: {
  label: string;
  tone?: 'sage' | 'warm';
}) {
  return (
    <View
      className={`rounded-pill px-sm py-xs ${
        tone === 'warm' ? 'bg-warning-bg' : 'bg-success-bg'
      }`}
    >
      <Text
        className={`font-body-semi text-caption ${
          tone === 'warm' ? 'text-warning-dark' : 'text-success-dark'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
