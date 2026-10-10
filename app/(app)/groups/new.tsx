import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
  PencilSquareIcon,
  UserPlusIcon,
} from 'react-native-heroicons/outline';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  ReduceMotion,
} from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { ChoiceCard } from '@/components/groups/choice-card';
import { CircleSeal } from '@/components/groups/circle-seal';
import { InviteShare } from '@/components/groups/invite-share';
import { AppButton } from '@/components/ui/button';
import { SoftPressable } from '@/components/ui/soft-pressable';
import { TextField } from '@/components/ui/text-field';
import { api, type Id } from '@/lib/convex-api';
import { formatCurrencyXAF } from '@/lib/format-currency';
import { MoneyText } from '@/components/ui/money-text';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/lib/theme';

type Schedule = 'weekly' | 'biweekly' | 'monthly';
type CollectionMode = 'via_treasurer' | 'direct_to_beneficiary';
type CreatorRole = 'president' | 'treasurer';

const TOTAL_STEPS = 5;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export default function GroupCreationWizard() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<Schedule>('weekly');
  const [meetingDayOfWeek, setMeetingDayOfWeek] = useState(6);
  const [amount, setAmount] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('via_treasurer');
  const [creatorRole, setCreatorRole] = useState<CreatorRole>('treasurer');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{
    groupId: Id<'groups'>;
    inviteCode: string;
  } | null>(null);
  const createGroup = useMutation(api.groups.createGroup);

  const parsedAmount = Number.parseInt(amount.replace(/[^\d]/g, ''), 10);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const parsedTarget = Number.parseInt(targetCount.replace(/[^\d]/g, ''), 10);
  const targetValid = Number.isFinite(parsedTarget) && parsedTarget >= 2;

  const goToStep = (next: number) => {
    setDirection(next >= step ? 1 : -1);
    setStep(next);
  };

  const scheduleLabel = t(`groups.wizard.schedule${schedule[0].toUpperCase()}${schedule.slice(1)}`);
  const rhythmSummary =
    schedule === 'monthly'
      ? scheduleLabel
      : t('groups.wizard.rhythmSummary', {
          schedule: scheduleLabel,
          day: t(`groups.days.${meetingDayOfWeek}`),
        });

  const handleCreate = async () => {
    if (creating || !amountValid) return;
    setCreating(true);
    try {
      const result = await createGroup({
        name: name.trim(),
        schedule,
        meetingDayOfWeek: schedule === 'monthly' ? undefined : meetingDayOfWeek,
        contributionAmount: parsedAmount,
        ...(targetValid && { targetMemberCount: parsedTarget }),
        collectionMode,
        creatorRole,
      });
      haptics.success();
      setCreated({ groupId: result.groupId, inviteCode: result.inviteCode });
    } catch {
      haptics.error();
      toast.error(t('common.error'));
    } finally {
      setCreating(false);
    }
  };

  const enterGroup = () => {
    if (!created) return;
    router.replace({ pathname: '/groups/[groupId]', params: { groupId: created.groupId } });
  };

  const goBack = () => {
    if (created) {
      enterGroup();
    } else if (step === 1) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      goToStep(step - 1);
    }
  };

  if (created) {
    return (
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.xxl,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <Animated.View
          entering={FadeInUp.duration(480).reduceMotion(ReduceMotion.System)}
          className="items-center gap-xl"
        >
          <CircleSeal progress={5} label={name.trim()} size={144} />
          <View className="items-center gap-xs">
            <Text className="text-center font-heading text-display-lg text-foreground">
              {t('groups.wizard.successTitle')}
            </Text>
            <Text className="max-w-[330px] text-center font-body text-body-sm text-muted">
              {t('groups.wizard.successBody', { name: name.trim() })}
            </Text>
          </View>
          <View className="w-full gap-sm">
            <InviteShare inviteCode={created.inviteCode} groupName={name.trim()} />
            <AppButton
              variant="outline"
              label={t('groups.wizard.addWithoutPhone')}
              icon={<UserPlusIcon size={19} color={theme.text} />}
              onPress={() =>
                router.push({
                  pathname: '/groups/[groupId]/add-member',
                  params: { groupId: created.groupId },
                })
              }
            />
            <AppButton variant="ghost" label={t('groups.wizard.enterGroup')} onPress={enterGroup} />
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    );
  }

  const entering = (direction > 0 ? FadeInRight : FadeInLeft)
    .duration(220)
    .reduceMotion(ReduceMotion.System);

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={72}
    >
      <WizardHeader step={step} onBack={goBack} />
      <CircleSeal
        progress={step}
        label={name.trim() || t('groups.wizard.sealLabel')}
        monogram={name.trim() || 'N'}
      />

      <Animated.View key={step} entering={entering} className="mt-xl gap-xl">
        {step === 1 ? (
          <>
            <StepHeading
              eyebrow={t('groups.wizard.identityEyebrow')}
              title={t('groups.wizard.nameTitle')}
              body={t('groups.wizard.nameBody')}
            />
            <TextField
              label={t('groups.wizard.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('groups.wizard.namePlaceholder')}
              autoComplete="off"
              autoCapitalize="sentences"
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => {
                if (name.trim()) goToStep(2);
              }}
            />
            <AppButton
              label={t('common.continue')}
              icon={<ArrowRightIcon size={19} color={theme.primaryForeground} />}
              iconPosition="end"
              disabled={!name.trim()}
              onPress={() => goToStep(2)}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <StepHeading
              eyebrow={t('groups.wizard.rhythmEyebrow')}
              title={t('groups.wizard.rhythmTitle')}
              body={t('groups.wizard.rhythmBody')}
            />
            <View className="gap-sm" accessibilityRole="radiogroup">
              {(['weekly', 'biweekly', 'monthly'] as const).map((value) => (
                <ChoiceCard
                  key={value}
                  title={t(
                    `groups.wizard.schedule${value[0].toUpperCase()}${value.slice(1)}`
                  )}
                  selected={schedule === value}
                  onPress={() => setSchedule(value)}
                />
              ))}
            </View>
            {schedule !== 'monthly' ? (
              <Animated.View
                entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
                className="gap-xs"
              >
                <Text className="font-body-medium text-label text-foreground">
                  {t('groups.wizard.dayLabel')}
                </Text>
                <View className="flex-row flex-wrap gap-xs" accessibilityRole="radiogroup">
                  {DAY_ORDER.map((day) => (
                    <SoftPressable
                      key={day}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: meetingDayOfWeek === day }}
                      onPress={() => {
                        haptics.select();
                        setMeetingDayOfWeek(day);
                      }}
                      className={
                        meetingDayOfWeek === day
                          ? 'min-h-[44px] items-center justify-center rounded-pill border border-accent bg-accent-light px-md'
                          : 'min-h-[44px] items-center justify-center rounded-pill border border-border bg-surface px-md'
                      }
                    >
                      <Text
                        className={
                          meetingDayOfWeek === day
                            ? 'font-body-semi text-body-sm text-foreground'
                            : 'font-body-medium text-body-sm text-muted'
                        }
                      >
                        {t(`groups.days.${day}`)}
                      </Text>
                    </SoftPressable>
                  ))}
                </View>
              </Animated.View>
            ) : null}
            <SummaryStrip text={rhythmSummary} />
            <AppButton label={t('common.continue')} onPress={() => goToStep(3)} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <StepHeading
              eyebrow={t('groups.wizard.contributionEyebrow')}
              title={t('groups.wizard.contributionTitle')}
              body={t('groups.wizard.contributionBody')}
            />
            <TextField
              label={t('groups.wizard.amountLabel')}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('groups.wizard.amountPlaceholder')}
              keyboardType="number-pad"
              inputMode="numeric"
              className="font-money text-title"
              autoFocus
            />
            {amountValid ? (
              <SummaryStrip
                text={t('groups.wizard.amountPreview', {
                  amount: formatCurrencyXAF(parsedAmount),
                })}
              />
            ) : null}
            <TextField
              label={t('groups.wizard.targetLabel')}
              value={targetCount}
              onChangeText={setTargetCount}
              placeholder={t('groups.wizard.targetPlaceholder')}
              keyboardType="number-pad"
              inputMode="numeric"
            />
            {amountValid && targetValid ? (
              <View className="rounded-2xl bg-highlight px-lg py-md">
                <Text className="font-body-medium text-caption text-highlight-fg">
                  {t('groups.wizard.handoverLabel')}
                </Text>
                <MoneyText size="hero" tone="onHighlight" className="mt-[2px]">
                  {formatCurrencyXAF(parsedAmount * parsedTarget)}
                </MoneyText>
                <Text className="mt-xs font-body text-caption text-highlight-fg">
                  {t('groups.wizard.handoverNote')}
                </Text>
              </View>
            ) : null}
            <AppButton
              label={t('common.continue')}
              disabled={!amountValid}
              onPress={() => goToStep(4)}
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <StepHeading
              eyebrow={t('groups.wizard.handoverEyebrow')}
              title={t('groups.wizard.modeTitle')}
              body={t('groups.wizard.modeBody')}
            />
            <View className="gap-sm" accessibilityRole="radiogroup">
              <ChoiceCard
                title={t('groups.wizard.modeViaTreasurer')}
                description={t('groups.wizard.modeViaTreasurerDesc')}
                selected={collectionMode === 'via_treasurer'}
                onPress={() => setCollectionMode('via_treasurer')}
              />
              <ChoiceCard
                title={t('groups.wizard.modeDirect')}
                description={t('groups.wizard.modeDirectDesc')}
                selected={collectionMode === 'direct_to_beneficiary'}
                onPress={() => setCollectionMode('direct_to_beneficiary')}
              />
            </View>
            <View className="flex-row items-start gap-sm rounded-2xl bg-success-bg p-md">
              <InformationCircleIcon size={20} color={theme.successDark} />
              <Text className="flex-1 font-body text-body-sm text-muted">
                {t('groups.wizard.modeCustodyNote')}
              </Text>
            </View>
            <AppButton label={t('common.continue')} onPress={() => goToStep(5)} />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <StepHeading
              eyebrow={t('groups.wizard.charterEyebrow')}
              title={t('groups.wizard.charterTitle')}
              body={t('groups.wizard.charterBody')}
            />
            <View className="gap-xs">
              <Text className="font-body-medium text-label text-foreground">
                {t('groups.wizard.roleLabel')}
              </Text>
              <View className="gap-sm" accessibilityRole="radiogroup">
                {(['treasurer', 'president'] as const).map((role) => (
                  <ChoiceCard
                    key={role}
                    title={t(`groups.roles.${role}`)}
                    description={t(`groups.wizard.role${role[0].toUpperCase()}${role.slice(1)}Desc`)}
                    selected={creatorRole === role}
                    onPress={() => setCreatorRole(role)}
                  />
                ))}
              </View>
            </View>
            <View
              className="overflow-hidden rounded-2xl border border-border-subtle bg-surface"
              style={{ borderCurve: 'continuous', ...theme.shadow('card') }}
            >
              <ReviewRow label={t('groups.wizard.reviewName')} value={name.trim()} onPress={() => goToStep(1)} />
              <ReviewRow label={t('groups.wizard.reviewRhythm')} value={rhythmSummary} onPress={() => goToStep(2)} />
              <ReviewRow
                label={t('groups.wizard.reviewContribution')}
                value={formatCurrencyXAF(parsedAmount)}
                onPress={() => goToStep(3)}
              />
              <ReviewRow
                label={t('groups.wizard.reviewHandover')}
                value={t(
                  collectionMode === 'via_treasurer'
                    ? 'groups.wizard.modeViaTreasurer'
                    : 'groups.wizard.modeDirect'
                )}
                onPress={() => goToStep(4)}
                last
              />
            </View>
            <Text className="font-body text-caption text-muted">
              {t('groups.wizard.roleHint')}
            </Text>
            <AppButton
              label={creating ? t('groups.wizard.creating') : t('groups.wizard.create')}
              loading={creating}
              onPress={() => void handleCreate()}
            />
          </>
        ) : null}
      </Animated.View>
    </KeyboardAwareScrollView>
  );
}

function WizardHeader({ step, onBack }: { step: number; onBack: () => void }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  return (
    <View
      className="flex-row items-center justify-between pb-md"
      accessibilityLabel={t('groups.wizard.step', { current: step, total: TOTAL_STEPS })}
    >
      <SoftPressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        className="h-[44px] w-[44px] items-center justify-center rounded-full bg-surface-muted"
      >
        <ChevronLeftIcon size={22} color={theme.textMuted} />
      </SoftPressable>
      <View className="flex-row items-center gap-xs">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <View
            key={index}
            style={{
              width: index + 1 <= step ? 24 : 12,
              height: 6,
              borderRadius: 999,
              backgroundColor:
                index + 1 <= step ? theme.successDark : theme.surfaceRecessed,
            }}
          />
        ))}
      </View>
      <Text className="w-[44px] text-right font-body-semi text-caption text-muted">
        {step}/{TOTAL_STEPS}
      </Text>
    </View>
  );
}

function StepHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View className="gap-xs">
      <Text className="font-body-semi text-overline uppercase text-success-dark">{eyebrow}</Text>
      <Text className="font-heading text-display-lg text-foreground">{title}</Text>
      <Text className="font-body text-body-sm text-muted">{body}</Text>
    </View>
  );
}

function SummaryStrip({ text }: { text: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
      className="rounded-xl bg-success-bg px-md py-sm"
    >
      <Text className="font-body-semi text-body-sm text-success-dark">{text}</Text>
    </Animated.View>
  );
}

function ReviewRow({
  label,
  value,
  onPress,
  last = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityLabel={t('groups.wizard.editField', { field: label })}
      onPress={onPress}
      scaleOnPress={false}
      className={`min-h-[64px] flex-row items-center gap-md px-lg py-sm ${last ? '' : 'border-b border-border-faint'}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="font-body-medium text-caption text-muted">{label}</Text>
        <Text className="font-body-semi text-body text-foreground">{value}</Text>
      </View>
      <PencilSquareIcon size={18} color={theme.textMuted} />
    </SoftPressable>
  );
}
