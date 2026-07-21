import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupCreateChooser } from '@/components/groups/group-create-chooser';
import { UnifiedGroupCard } from '@/components/groups/unified-group-card';
import { SoftPressable } from '@/components/ui/soft-pressable';
import {
  sortGroupSummaries,
  type GroupSummary,
} from '@/lib/group-summary';
import { cn } from '@/lib/cn';
import { useAppTheme } from '@/lib/theme';

type PreviewView = 'groups' | 'chooser';
type PreviewLanguage = 'fr' | 'en';

function prototypeGroups(now: number): GroupSummary[] {
  return [
    {
      mode: 'contribution',
      id: 'family-support',
      title: 'Soutien à la famille Mballa',
      purpose: 'funeral',
      status: 'open',
      confirmedAmount: 185_000,
      goalAmount: 250_000,
      awaitingConfirmationCount: 3,
      deadlineAt: now + 10 * 86_400_000,
      viewerActionCount: 1,
      href: '/g/prototype-family-support',
    },
    {
      mode: 'njangi',
      id: 'mboa-ensemble',
      title: 'Njangi Mboa Ensemble',
      purpose: 'savings',
      status: 'active',
      nextDueAt: now + 86_400_000,
      viewerDueAmount: 25_000,
      viewerReceivingAmount: null,
      viewerActionCount: 1,
      href: '/groups/prototype-njangi',
    },
    {
      mode: 'contribution',
      id: 'carine-joel',
      title: 'Mariage de Carine & Joël',
      purpose: 'wedding',
      status: 'open',
      confirmedAmount: 320_000,
      goalAmount: 500_000,
      awaitingConfirmationCount: 0,
      deadlineAt: now + 24 * 86_400_000,
      viewerActionCount: 0,
      href: '/g/prototype-wedding',
    },
    {
      mode: 'njangi',
      id: 'parents-bonamoussadi',
      title: 'Parents de Bonamoussadi',
      purpose: 'school',
      status: 'active',
      nextDueAt: now + 14 * 86_400_000,
      viewerDueAmount: null,
      viewerReceivingAmount: 180_000,
      viewerActionCount: 0,
      href: '/groups/prototype-parents',
    },
  ];
}

export default function UnifiedGroupsPrototypeScreen() {
  if (!__DEV__) return <Redirect href="/" />;

  return <UnifiedGroupsPrototypeContent />;
}

function UnifiedGroupsPrototypeContent() {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    language?: string;
    view?: string;
  }>();
  const [language, setLanguage] = useState<PreviewLanguage>(
    params.language === 'en' ? 'en' : 'fr'
  );
  const [view, setView] = useState<PreviewView>(
    params.view === 'chooser' ? 'chooser' : 'groups'
  );
  const [lastChoice, setLastChoice] = useState<string | null>(null);
  const groups = useMemo(
    () => sortGroupSummaries(prototypeGroups(Date.now())),
    []
  );

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [i18n, language]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View className="w-full max-w-[560px] self-center gap-lg">
        <View className="gap-sm">
          <Text className="font-body-semi text-overline uppercase text-success-dark">
            {t('groups.prototype.eyebrow')}
          </Text>
          <View className="flex-row items-start justify-between gap-md">
            <View className="min-w-0 flex-1 gap-xs">
              <Text className="font-heading text-display-lg text-foreground">
                {t('groups.prototype.title')}
              </Text>
              <Text className="font-body text-body-sm text-muted">
                {t('groups.prototype.subtitle')}
              </Text>
            </View>
            <View className="flex-row rounded-pill bg-surface-muted p-[3px]">
              {(['fr', 'en'] as const).map((value) => (
                <SoftPressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: language === value }}
                  onPress={() => setLanguage(value)}
                  className={cn(
                    'min-h-[38px] items-center justify-center rounded-pill px-sm',
                    language === value && 'bg-surface'
                  )}
                >
                  <Text
                    className={
                      language === value
                        ? 'font-body-semi text-caption uppercase text-foreground'
                        : 'font-body-semi text-caption uppercase text-muted'
                    }
                  >
                    {value}
                  </Text>
                </SoftPressable>
              ))}
            </View>
          </View>
        </View>

        <View className="flex-row gap-xs" accessibilityRole="tablist">
          <PreviewTab
            label={t('groups.prototype.groupsTab')}
            selected={view === 'groups'}
            onPress={() => setView('groups')}
          />
          <PreviewTab
            label={t('groups.prototype.chooserTab')}
            selected={view === 'chooser'}
            onPress={() => setView('chooser')}
          />
        </View>

        {view === 'groups' ? (
          <View className="gap-sm">
            <View className="flex-row flex-wrap gap-xs pb-xs">
              <View className="rounded-pill bg-warning-bg px-sm py-xs">
                <Text className="font-body-semi text-caption text-warning-dark">
                  {t('groups.prototype.needYou', { count: 2 })}
                </Text>
              </View>
              <View className="rounded-pill bg-success-bg px-sm py-xs">
                <Text className="font-body-semi text-caption text-success-dark">
                  {t('groups.prototype.mixedModes')}
                </Text>
              </View>
            </View>
            {groups.map((group) => (
              <UnifiedGroupCard key={group.id} group={group} />
            ))}
          </View>
        ) : (
          <View className="gap-md">
            <GroupCreateChooser
              onContribution={() =>
                setLastChoice(t('groups.unifiedChooser.contributionTitle'))
              }
              onNjangi={() =>
                setLastChoice(t('groups.unifiedChooser.njangiTitle'))
              }
              onJoin={() =>
                setLastChoice(t('groups.unifiedChooser.joinTitle'))
              }
            />
            {lastChoice ? (
              <View className="rounded-xl border border-success bg-success-bg p-md">
                <Text className="font-body-semi text-body-sm text-success-dark">
                  {t('groups.prototype.selected', { choice: lastChoice })}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function PreviewTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <SoftPressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-[44px] flex-1 items-center justify-center rounded-pill px-md',
        selected
          ? 'bg-accent'
          : 'border border-border bg-surface'
      )}
    >
      <Text
        className={
          selected
            ? 'font-body-semi text-body-sm text-primary-fg'
            : 'font-body-semi text-body-sm text-muted'
        }
      >
        {label}
      </Text>
    </SoftPressable>
  );
}
