import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
// Legacy API on purpose: uploadAsync streams the file natively — RN fetch
// cannot build a Blob from a file:// URI (ArrayBuffer blobs unsupported).
import * as FileSystem from 'expo-file-system/legacy';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import {
  CameraIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
  PhotoIcon,
} from 'react-native-heroicons/outline';

import { api, type Id } from '../../../../../../../src/lib/convex-api';
import { formatCurrencyXAF } from '../../../../../../../src/lib/format-currency';
import { haptics } from '../../../../../../../src/lib/haptics';
import { newIdempotencyKey } from '../../../../../../../src/lib/idempotency';
import { useAppTheme } from '../../../../../../../src/lib/theme';
import { usePayFlow } from '../../../../../../../src/hooks/use-pay-flow';
import { AppButton } from '../../../../../../../src/components/ui/button';
import { TextField } from '../../../../../../../src/components/ui/text-field';
import { Skeleton } from '../../../../../../../src/components/skeleton';
import { ImagePreviewModal } from '../../../../../../../src/components/image-preview-modal';

/**
 * Pay flow step 3 — claim (docs/03 B4): amount prefilled with the remaining
 * obligation and EDITABLE (02 edge case 7 — under/over warns, never
 * blocks); proof is a PHOTO (MoMo SMS / receipt screenshot) uploaded to
 * Convex storage before the claim, `proofType: 'screenshot'` — accepted,
 * never trusted (I-10). « Déclarer sans preuve » stays allowed (decision
 * 3). Confirmation — not proof — is what makes the payment official
 * (decision 2 microcopy).
 */
export default function PayClaimScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { groupId, roundId, record, method } = useLocalSearchParams<{
    groupId: string;
    roundId: string;
    record: string;
    method: 'momo_mtn' | 'orange_money';
  }>();
  const payMethod = method === 'orange_money' ? 'orange_money' : 'momo_mtn';
  const flow = usePayFlow(roundId, record);
  const claim = useMutation(api.paymentRecords.claim);
  const generateProofUploadUrl = useMutation(
    api.paymentRecords.generateProofUploadUrl
  );

  const [amountText, setAmountText] = useState<string | null>(null); // null ⇒ prefill
  const [proof, setProof] = useState<{
    uri: string;
    mimeType: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const prefill = flow.record?.amount ?? 0;
  const effectiveAmountText = amountText ?? String(prefill);
  const amount = useMemo(() => {
    const parsed = Number(effectiveAmountText.replace(/[\s.]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [effectiveAmountText]);

  const warning =
    amount === null || !flow.record
      ? null
      : amount < flow.record.amount
        ? t('pay.partialWarning', {
            amount: formatCurrencyXAF(flow.record.amount - amount),
          })
        : amount > flow.record.amount
          ? t('pay.overWarning')
          : null;

  const pickProof = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.error(t('pay.cameraDenied'));
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.5,
          });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      setProof({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
      haptics.light();
    }
  };

  const uploadProof = async (): Promise<Id<'_storage'>> => {
    const uploadUrl = await generateProofUploadUrl({});
    const res = await FileSystem.uploadAsync(uploadUrl, proof!.uri, {
      httpMethod: 'POST',
      headers: { 'Content-Type': proof!.mimeType },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(t('pay.uploadFailed'));
    }
    const { storageId } = JSON.parse(res.body) as {
      storageId: Id<'_storage'>;
    };
    return storageId;
  };

  const submit = async (withProof: boolean) => {
    if (!flow.record) return;
    if (amount === null) {
      toast.error(t('pay.invalidAmount'));
      return;
    }
    setBusy(true);
    try {
      const screenshotStorageId =
        withProof && proof ? await uploadProof() : undefined;
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      await claim({
        paymentRecordId: flow.record.paymentRecordId as Id<'paymentRecords'>,
        idempotencyKey: keyRef.current,
        amount,
        method: payMethod,
        ...(screenshotStorageId !== undefined && { screenshotStorageId }),
      });
      haptics.success();
      toast.success(
        t('pay.declared', { name: flow.payee?.displayName ?? '—' })
      );
      router.dismissTo({
        pathname: '/groups/[groupId]/rounds/[roundId]',
        params: { groupId, roundId },
      });
    } catch (err) {
      haptics.error();
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
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
        <View className="min-w-0 flex-1">
          <Text className="font-heading text-title text-foreground">
            {t('pay.claimTitle')}
          </Text>
          {flow.round ? (
            <Text className="font-body text-body-sm text-muted">
              {t('pay.claimContext', {
                method: t(`payments.method.${payMethod}`),
                name: flow.payee?.displayName ?? '—',
                n: flow.round.index,
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {flow.loading || !flow.record ? (
        <View className="mt-lg gap-sm">
          <Skeleton className="h-[72px] rounded-lg" />
          <Skeleton className="h-[72px] rounded-lg" />
        </View>
      ) : (
        <View className="mt-lg gap-md">
          <View className="gap-xs">
            <TextField
              label={t('pay.amountSent')}
              value={effectiveAmountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              testID="claim-amount"
            />
            <Text className="font-body text-caption text-muted">
              {t('pay.amountPrefilled')}
            </Text>
            {warning ? (
              <Text className="font-body-medium text-body-sm text-warning-dark">
                {warning}
              </Text>
            ) : null}
          </View>

          <View className="gap-xs">
            <Text className="font-body-medium text-body-sm text-foreground">
              {t('pay.proofPhotoLabel')}
            </Text>
            {proof ? (
              <View className="gap-xs">
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t('payment.proofImageOpen')}
                  onPress={() => setPreviewOpen(true)}
                >
                  <Image
                    source={{ uri: proof.uri }}
                    resizeMode="cover"
                    style={{
                      height: 180,
                      width: '100%',
                      borderRadius: theme.radius.lg,
                      backgroundColor: theme.surfaceMuted,
                    }}
                    accessibilityLabel={t('pay.proofPhotoLabel')}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setProof(null)}
                  className="self-start rounded-md px-xs py-[2px] active:bg-surface-muted"
                  testID="claim-remove-photo"
                >
                  <Text className="font-body-medium text-body-sm text-destructive">
                    {t('pay.removePhoto')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row gap-sm">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickProof('camera')}
                  className="flex-1 flex-row items-center justify-center gap-xs rounded-lg border border-border bg-surface px-sm py-md active:bg-surface-muted"
                  testID="claim-take-photo"
                >
                  <CameraIcon size={18} color={theme.textMuted} />
                  <Text className="font-body-medium text-body-sm text-foreground">
                    {t('pay.takePhoto')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickProof('library')}
                  className="flex-1 flex-row items-center justify-center gap-xs rounded-lg border border-border bg-surface px-sm py-md active:bg-surface-muted"
                  testID="claim-choose-image"
                >
                  <PhotoIcon size={18} color={theme.textMuted} />
                  <Text className="font-body-medium text-body-sm text-foreground">
                    {t('pay.chooseImage')}
                  </Text>
                </Pressable>
              </View>
            )}
            <Text className="font-body text-caption text-muted">
              {t('pay.photoHint')}
            </Text>
          </View>

          <View className="flex-row items-start gap-xs">
            <InformationCircleIcon size={16} color={theme.textMuted} />
            <Text className="flex-1 font-body text-body-sm text-muted">
              {t('pay.proofNote', { name: flow.payee?.displayName ?? '—' })}
            </Text>
          </View>

          <AppButton
            label={t('pay.declareCta')}
            loading={busy}
            disabled={busy}
            onPress={() => void submit(true)}
            testID="claim-submit"
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void submit(false)}
            className="items-center py-xs"
            testID="claim-no-proof"
          >
            <Text className="font-body-medium text-body-sm text-muted underline">
              {t('pay.declareNoProof')}
            </Text>
          </Pressable>
        </View>
      )}

      <ImagePreviewModal
        uri={previewOpen && proof ? proof.uri : null}
        onClose={() => setPreviewOpen(false)}
      />
    </ScrollView>
  );
}
