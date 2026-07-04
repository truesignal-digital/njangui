import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  CheckIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
} from 'react-native-heroicons/outline';
import { toast } from 'sonner-native';

import { api, type Id } from '../../../src/lib/convex-api';
import { cn } from '../../../src/lib/cn';
import { formatCurrencyXAF } from '../../../src/lib/format-currency';
import { haptics } from '../../../src/lib/haptics';
import { useAppTheme } from '../../../src/lib/theme';
import { AppButton } from '../../../src/components/ui/button';
import { TextField } from '../../../src/components/ui/text-field';
import { InviteShare } from '../../../src/components/groups/invite-share';

type Schedule = 'weekly' | 'biweekly' | 'monthly';
type CollectionMode = 'via_treasurer' | 'direct_to_beneficiary';
type CreatorRole = 'president' | 'treasurer';

const TOTAL_STEPS = 4;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // lundi → dimanche

/**
 * Group creation wizard (docs/03 B9, Week 1 slice): name → rhythm + fixed
 * amount → money flow + creator role → invite (code + WhatsApp). In-route
 * state, one Convex mutation at the end of step 3; back never loses input.
 * The rotation-order builder and « Démarrer le cycle » are Week 2.
 *
 * `creatorRole` is required by api.groups.createGroup (02 DECISION: the
 * champion/buyer is often the treasurer — never auto-crown a président).
 */
export default function GroupCreationWizard() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<Schedule>('weekly');
  const [meetingDayOfWeek, setMeetingDayOfWeek] = useState(6); // samedi
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

  const handleCreate = async () => {
    if (creating) return;
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
      setStep(4);
    } catch {
      haptics.error();
      toast.error(t('common.error'));
    } finally {
      setCreating(false);
    }
  };

  const finish = () => {
    if (!created) return;
    router.replace({
      pathname: '/groups/[groupId]',
      params: { groupId: created.groupId },
    });
  };

  const goBack = () => {
    if (created) {
      finish();
      return;
    }
    if (step === 1) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    setStep(step - 1);
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={62}
    >
      {/* Header: back + progress dots */}
      <View
        className="flex-row items-center justify-between pb-lg"
        accessibilityLabel={t('groups.wizard.step', { current: step, total: TOTAL_STEPS })}
      >
        {created ? (
          <View className="h-[36px] w-[36px]" />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={goBack}
            className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
          >
            <ChevronLeftIcon size={22} color={theme.textMuted} />
          </Pressable>
        )}
        <View className="flex-row items-center gap-xs">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View
              key={i}
              className={cn(
                'h-[8px] w-[8px] rounded-full',
                i + 1 <= step ? 'bg-accent' : 'bg-surface-muted'
              )}
            />
          ))}
        </View>
        <Text className="w-[36px] text-right font-body text-caption text-muted">
          {step}/{TOTAL_STEPS}
        </Text>
      </View>

      {step === 1 ? (
        <View className="gap-xl">
          <Text className="font-heading text-display-lg text-foreground">
            {t('groups.wizard.nameTitle')}
          </Text>
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
              if (name.trim()) setStep(2);
            }}
          />
          <Text className="font-body text-body-sm text-muted">
            {t('groups.wizard.currencyNote')}
          </Text>
          <AppButton
            label={t('common.continue')}
            disabled={name.trim().length === 0}
            onPress={() => setStep(2)}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View className="gap-xl">
          <Text className="font-heading text-display-lg text-foreground">
            {t('groups.wizard.rhythmTitle')}
          </Text>

          <View className="gap-xs">
            <Text className="font-body-medium text-label text-foreground">
              {t('groups.wizard.scheduleLabel')}
            </Text>
            {(
              [
                ['weekly', t('groups.wizard.scheduleWeekly')],
                ['biweekly', t('groups.wizard.scheduleBiweekly')],
                ['monthly', t('groups.wizard.scheduleMonthly')],
              ] as const
            ).map(([value, label]) => (
              <RadioRow
                key={value}
                label={label}
                selected={schedule === value}
                onPress={() => {
                  haptics.select();
                  setSchedule(value);
                }}
              />
            ))}
          </View>

          {schedule !== 'monthly' ? (
            <View className="gap-xs">
              <Text className="font-body-medium text-label text-foreground">
                {t('groups.wizard.dayLabel')}
              </Text>
              <View className="flex-row flex-wrap gap-xs">
                {DAY_ORDER.map((day) => (
                  <Pressable
                    key={day}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: meetingDayOfWeek === day }}
                    onPress={() => {
                      haptics.select();
                      setMeetingDayOfWeek(day);
                    }}
                    className={cn(
                      'min-h-[40px] items-center justify-center rounded-pill border px-md',
                      meetingDayOfWeek === day
                        ? 'border-accent bg-accent-light'
                        : 'border-border bg-surface'
                    )}
                  >
                    <Text
                      className={cn(
                        'font-body-medium text-body-sm',
                        meetingDayOfWeek === day ? 'text-foreground' : 'text-muted'
                      )}
                    >
                      {t(`groups.days.${day}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View className="gap-xs">
            <TextField
              label={t('groups.wizard.amountLabel')}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('groups.wizard.amountPlaceholder')}
              keyboardType="number-pad"
              inputMode="numeric"
              className="font-body-semi text-title"
            />
            {amountValid ? (
              <Text className="font-body text-body-sm text-muted">
                {t('groups.wizard.amountPreview', { amount: formatCurrencyXAF(parsedAmount) })}
              </Text>
            ) : null}
          </View>

          <View className="gap-xs">
            <TextField
              label={t('groups.wizard.targetLabel')}
              value={targetCount}
              onChangeText={setTargetCount}
              placeholder={t('groups.wizard.targetPlaceholder')}
              keyboardType="number-pad"
              inputMode="numeric"
            />
            {amountValid && targetValid ? (
              <Text className="font-body text-body-sm text-muted">
                {t('groups.wizard.potPreview', {
                  amount: formatCurrencyXAF(parsedAmount * parsedTarget),
                })}
              </Text>
            ) : null}
          </View>

          <AppButton
            label={t('common.continue')}
            disabled={!amountValid}
            onPress={() => setStep(3)}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View className="gap-xl">
          <Text className="font-heading text-display-lg text-foreground">
            {t('groups.wizard.modeTitle')}
          </Text>

          <View className="gap-sm">
            {(
              [
                [
                  'via_treasurer',
                  t('groups.wizard.modeViaTreasurer'),
                  t('groups.wizard.modeViaTreasurerDesc'),
                ],
                [
                  'direct_to_beneficiary',
                  t('groups.wizard.modeDirect'),
                  t('groups.wizard.modeDirectDesc'),
                ],
              ] as const
            ).map(([value, label, desc]) => (
              <RadioRow
                key={value}
                label={label}
                description={desc}
                selected={collectionMode === value}
                onPress={() => {
                  haptics.select();
                  setCollectionMode(value);
                }}
              />
            ))}
          </View>

          <View className="gap-xs">
            <Text className="font-body-medium text-label text-foreground">
              {t('groups.wizard.roleLabel')}
            </Text>
            {(['treasurer', 'president'] as const).map((role) => (
              <RadioRow
                key={role}
                label={t(`groups.roles.${role}`)}
                selected={creatorRole === role}
                onPress={() => {
                  haptics.select();
                  setCreatorRole(role);
                }}
              />
            ))}
            <Text className="font-body text-body-sm text-muted">
              {t('groups.wizard.roleHint')}
            </Text>
          </View>

          {/* Custody-free red line (docs/00) — trust feature, not fine print */}
          <View className="flex-row items-start gap-xs rounded-lg bg-surface-muted p-sm">
            <InformationCircleIcon size={16} color={theme.textMuted} />
            <Text className="flex-1 font-body text-body-sm text-muted">
              {t('groups.wizard.modeCustodyNote')}
            </Text>
          </View>

          <AppButton
            label={creating ? t('groups.wizard.creating') : t('groups.wizard.create')}
            loading={creating}
            onPress={() => void handleCreate()}
          />
        </View>
      ) : null}

      {step === 4 && created ? (
        <View className="gap-xl">
          <Text className="font-heading text-display-lg text-foreground">
            {t('groups.wizard.inviteTitle')}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {t('groups.wizard.inviteHint')}
          </Text>
          <InviteShare inviteCode={created.inviteCode} groupName={name.trim()} />
          <AppButton variant="outline" label={t('groups.wizard.finish')} onPress={finish} />
        </View>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function RadioRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-cta justify-center rounded-lg border px-md py-sm',
        selected ? 'border-accent bg-accent-faint' : 'border-border bg-surface'
      )}
    >
      <View className="flex-row items-center justify-between gap-xs">
        <Text
          className={cn(
            'shrink font-body-semi text-body',
            selected ? 'text-foreground' : 'text-muted'
          )}
        >
          {label}
        </Text>
        {selected ? <CheckIcon size={18} color={theme.accent} /> : null}
      </View>
      {description ? (
        <Text className="mt-xs font-body text-body-sm text-muted">{description}</Text>
      ) : null}
    </Pressable>
  );
}
