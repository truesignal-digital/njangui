import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';

import { api } from '../lib/convex-api';
import {
  getOrCreateDeviceId,
  storeDeviceSecret,
} from '../lib/device-credential';
import { haptics } from '../lib/haptics';
import { isValidE164, normalizePhone } from '../lib/phone-client';
import { AppButton } from './ui/button';
import { TextField } from './ui/text-field';

type Step = 'idle' | 'phone' | 'code';

/**
 * Optional-phone attach (profile): phone → WhatsApp code → linkPhone
 * (authed; the linkGuard chokepoint). This verify — not signup — is what
 * links feature-phone memberships and their ledger history to the account,
 * and it registers the device credential for silent re-auth. Hidden once
 * the account has a phone: phone-change is deliberately unsupported.
 */
export function PhoneLinkSection() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const requestOtp = useAction(api.otp.requestOtp);
  const linkPhone = useAction(api.otp.linkPhone);

  const [step, setStep] = useState<Step>('idle');
  const [localPhone, setLocalPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // No row yet (loading) or phone already attached → nothing to offer.
  if (!me || me.phone) return null;

  const language = i18n.language === 'en' ? ('en' as const) : ('fr' as const);
  // +237 default (Cameroon); a leading + means full E.164 (diaspora).
  const fullPhone = localPhone.trim().startsWith('+')
    ? normalizePhone(localPhone.trim())
    : normalizePhone(`+237${localPhone.trim()}`);

  const sendCode = async () => {
    if (!isValidE164(fullPhone)) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!deviceIdRef.current) {
        deviceIdRef.current = await getOrCreateDeviceId();
      }
      const result = await requestOtp({
        phone: fullPhone,
        purpose: 'login',
        deviceId: deviceIdRef.current,
        language,
      });
      if (!result.ok) {
        setError(
          result.retryAfterMs && result.retryAfterMs > 0
            ? t('auth.retryLater', {
                seconds: Math.ceil(result.retryAfterMs / 1000),
              })
            : t('common.error')
        );
        return;
      }
      haptics.light();
      setStep('code');
      setCooldown(60);
      if (result.devCode) {
        setCode(result.devCode); // dev provider only — never set in production
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const deviceId = deviceIdRef.current ?? (await getOrCreateDeviceId());
      const result = await linkPhone({
        phone: fullPhone,
        code: code.trim(),
        deviceId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      if (!result.ok) {
        setError(
          result.reason === 'expired'
            ? t('auth.codeExpired')
            : result.reason === 'collision'
              ? t('profile.phoneTaken')
              : result.reason === 'phone_change'
                ? t('profile.phoneChangeUnsupported')
                : t('auth.codeInvalid')
        );
        return;
      }
      // Store the device credential — the secret is returned exactly once.
      if (result.deviceSecret) {
        await storeDeviceSecret(result.deviceSecret, t('auth.biometricPrompt'));
      }
      haptics.success();
      toast.success(t('profile.phoneLinked'));
      // me.phone updates reactively and this section unmounts itself.
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'idle') {
    return (
      <View className="gap-sm rounded-xl border border-border-subtle bg-surface p-lg">
        <View className="gap-[2px]">
          <Text className="font-body-semi text-body text-foreground">
            {t('profile.phoneTitle')}
          </Text>
          <Text className="font-body text-caption text-muted">
            {t('profile.phoneDesc')}
          </Text>
        </View>
        <AppButton
          variant="outline"
          label={t('profile.addPhoneCta')}
          onPress={() => setStep('phone')}
          testID="phone-link-start"
        />
      </View>
    );
  }

  return (
    <View className="gap-md rounded-xl border border-border-subtle bg-surface p-lg">
      <View className="gap-[2px]">
        <Text className="font-body-semi text-body text-foreground">
          {t('profile.phoneTitle')}
        </Text>
        <Text className="font-body text-caption text-muted">
          {step === 'phone'
            ? t('auth.whatsappDesc')
            : t('auth.codeSentTo', { phone: fullPhone })}
        </Text>
      </View>

      {step === 'phone' ? (
        <>
          <TextField
            label={t('auth.phoneLabel')}
            prefix="+237"
            value={localPhone}
            onChangeText={(text) => {
              setLocalPhone(text);
              setError(null);
            }}
            placeholder="6 7X XX XX XX"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={error}
            testID="phone-link-phone"
          />
          <AppButton
            label={t('auth.sendCode')}
            loading={busy}
            disabled={busy || localPhone.trim().length < 6}
            onPress={() => void sendCode()}
            testID="phone-link-send"
          />
        </>
      ) : (
        <>
          <TextField
            label={t('auth.codeLabel')}
            value={code}
            onChangeText={(text) => {
              setCode(text);
              setError(null);
            }}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={8}
            autoComplete="one-time-code"
            error={error}
            testID="phone-link-code"
          />
          <AppButton
            label={t('auth.verifyCta')}
            loading={busy}
            disabled={busy || code.trim().length < 4}
            onPress={() => void verify()}
            testID="phone-link-verify"
          />
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
              className="py-xs"
            >
              <Text className="font-body-medium text-body-sm text-muted">
                {t('auth.changePhone')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || cooldown > 0}
              onPress={() => void sendCode()}
              className="py-xs"
              testID="phone-link-resend"
            >
              <Text
                className={
                  cooldown > 0
                    ? 'font-body-medium text-body-sm text-placeholder'
                    : 'font-body-medium text-body-sm text-accent'
                }
              >
                {cooldown > 0
                  ? t('auth.resendIn', { seconds: cooldown })
                  : t('auth.resend')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
