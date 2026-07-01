import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

import { formatCurrencyXAF } from '../../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../../src/lib/haptics';
import { useAppTheme } from '../../../../../../../src/lib/theme';
import {
  interpolateUssdStep,
  useUssdContent,
  type UssdMethod,
} from '../../../../../../../src/lib/ussd-content';
import { usePayFlow } from '../../../../../../../src/hooks/use-pay-flow';
import { AppButton } from '../../../../../../../src/components/ui/button';
import { Skeleton } from '../../../../../../../src/components/skeleton';

/** Local display form for the USSD copy-tap field: +2376… → 6… */
function localPhone(phone: string | undefined): string {
  if (!phone) return '—';
  return phone.startsWith('+237') ? phone.slice(4) : phone.replace('+', '');
}

/**
 * Pay flow step 2 — USSD instructions (docs/03 B4/§C). Bundled-first
 * content (readable offline on first run), non-dismissable menu-drift
 * banner, copy-tap fields, `tel:` dial button with `#` percent-encoded and
 * the ALWAYS-visible copy-code fallback (Tecno/Itel dialers strip *#).
 */
export default function UssdScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId, record, method } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
    record: string;
    method: UssdMethod;
  }>();
  const ussdMethod: UssdMethod = method === 'orange_money' ? 'orange_money' : 'momo_mtn';
  const language = i18n.language === 'en' ? 'en' : 'fr';
  const content = useUssdContent(ussdMethod, language);
  const flow = usePayFlow(roundId, record);

  const payeeNumber = localPhone(flow.payee?.phone);
  const amountRaw = flow.record ? String(flow.record.amount) : '';

  const dial = () => {
    haptics.light();
    void Linking.openURL(`tel:${encodeURIComponent(content.code)}`);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center gap-xs">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          className="h-[36px] w-[36px] items-center justify-center rounded-md active:bg-surface-muted"
        >
          <ChevronLeftIcon size={22} color={theme.textMuted} />
        </Pressable>
        <Text className="flex-1 font-heading text-title text-foreground">
          {content.title}
        </Text>
      </View>

      {/* Non-dismissable menu-drift banner (03 §C) */}
      <View className="mt-md rounded-lg border border-warning-dark bg-warning-bg p-sm">
        <Text className="font-body-medium text-body-sm text-warning-dark">
          {t('pay.banner')}
        </Text>
      </View>

      {flow.loading ? (
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[64px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </View>
      ) : (
        <>
          {/* Copy-tap fields */}
          <View className="mt-lg gap-sm">
            <CopyField
              label={t('pay.payeeNumber', {
                name: flow.payee?.displayName ?? '—',
              })}
              display={payeeNumber}
              copyValue={payeeNumber.replace(/\s/g, '')}
            />
            <CopyField
              label={t('pay.amountLabel')}
              display={
                flow.record ? formatCurrencyXAF(flow.record.amount) : '—'
              }
              copyValue={amountRaw}
            />
            <CopyField
              label={t('pay.reference')}
              display={flow.reference}
              copyValue={flow.reference}
            />
          </View>

          {/* Numbered steps — bundled/cached/fetched, best version wins */}
          <View className="mt-lg gap-sm">
            {content.steps.map((step, index) => (
              <View key={index} className="flex-row gap-sm">
                <Text className="w-[22px] font-body-semi text-body-sm text-accent">
                  {index + 1}.
                </Text>
                <Text className="flex-1 font-body text-body-sm text-foreground">
                  {interpolateUssdStep(step, {
                    name: flow.payee?.displayName ?? '—',
                    number: payeeNumber,
                    amount: amountRaw,
                    reference: flow.reference,
                  })}
                </Text>
              </View>
            ))}
          </View>

          {/* Dial + ALWAYS-visible copy fallback */}
          <View className="mt-lg gap-sm">
            <AppButton
              label={t('pay.dial', { code: content.code })}
              onPress={dial}
              testID="ussd-dial"
            />
            <CopyCodeFallback code={content.code} />
            <AppButton
              variant="outline"
              label={t('pay.sent')}
              testID="ussd-sent"
              onPress={() =>
                router.push({
                  pathname: '/groups/[groupId]/rounds/[roundId]/pay/claim',
                  params: { groupId, roundId, record, method: ussdMethod },
                })
              }
            />
          </View>

          <Text className="mt-lg font-body text-body-sm text-muted">
            ℹ{' '}
            {t('pay.custodyNote', { name: flow.payee?.displayName ?? '—' })}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function CopyField({
  label,
  display,
  copyValue,
}: {
  label: string;
  display: string;
  copyValue: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(copyValue);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View className="gap-xs">
      <Text className="font-body-medium text-label text-foreground">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void copy()}
        className="min-h-cta flex-row items-center justify-between rounded-lg border border-border bg-surface px-md active:bg-surface-muted"
      >
        <Text className="font-body-semi text-body text-foreground">
          {display}
        </Text>
        <Text className="font-body-medium text-body-sm text-accent">
          {copied ? t('common.copied') : t('common.copy')}
        </Text>
      </Pressable>
    </View>
  );
}

function CopyCodeFallback({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Pressable
      accessibilityRole="button"
      testID="ussd-copy-code"
      onPress={() => void copy()}
      className="items-center py-xs"
    >
      <Text className="font-body-medium text-body-sm text-accent">
        {copied ? t('common.copied') : t('pay.copyCode', { code })}
      </Text>
    </Pressable>
  );
}
