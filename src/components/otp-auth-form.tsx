import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAction } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api } from '../lib/convex-api';
import { useSignIn } from '../lib/clerk-client';
import {
  getOrCreateDeviceId,
  storeDeviceSecret,
} from '../lib/device-credential';
import { haptics } from '../lib/haptics';
import { isValidE164, normalizePhone } from '../lib/phone-client';
import { AppButton } from './ui/button';
import { TextField } from './ui/text-field';

type Step = 'phone' | 'code';

/**
 * WhatsApp OTP sign-in (auth spec): phone → code arrives in WhatsApp
 * (SMS fallback) → verify → Clerk sign-in ticket → session. On success the
 * device registers a credential so future opens skip the OTP entirely.
 * Uses signIn.create({strategy:'ticket'}) + setActive — NOT the Core-3
 * ticket()/finalize() path (clerk/javascript#8219).
 */
export function OtpAuthForm() {
  const { t, i18n } = useTranslation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const requestOtp = useAction(api.otp.requestOtp);
  const verifyOtp = useAction(api.otp.verifyOtp);

  const [step, setStep] = useState<Step>('phone');
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

  const language = i18n.language === 'en' ? ('en' as const) : ('fr' as const);
  // +237 default (Cameroon); a leading + means the user typed full E.164
  // (diaspora members are routine).
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
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const deviceId =
        deviceIdRef.current ?? (await getOrCreateDeviceId());
      const result = await verifyOtp({
        phone: fullPhone,
        code: code.trim(),
        purpose: 'login',
        deviceId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      if (!result.ok) {
        setError(
          result.reason === 'expired'
            ? t('auth.codeExpired')
            : t('auth.codeInvalid')
        );
        return;
      }

      // Store the device credential BEFORE consuming the short-TTL ticket —
      // the secret is returned exactly once.
      if (result.deviceSecret) {
        await storeDeviceSecret(
          result.deviceSecret,
          t('auth.biometricPrompt')
        );
      }

      const attempt = await signIn.create({
        strategy: 'ticket',
        ticket: result.ticket,
      });
      if (attempt.status === 'complete' && setActive) {
        haptics.success();
        await setActive({ session: attempt.createdSessionId });
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'phone') {
    return (
      <View className="gap-md px-lg">
        <View className="gap-xs">
          <Text className="font-heading text-title text-foreground">
            {t('auth.signInHeading')}
          </Text>
          <Text className="font-body text-body-sm text-muted">
            {t('auth.whatsappDesc')}
          </Text>
        </View>
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
          testID="otp-phone"
        />
        <AppButton
          label={t('auth.sendCode')}
          loading={busy}
          disabled={busy || localPhone.trim().length < 6}
          onPress={() => void sendCode()}
          testID="otp-send"
        />
      </View>
    );
  }

  return (
    <View className="gap-md px-lg">
      <View className="gap-xs">
        <Text className="font-heading text-title text-foreground">
          {t('auth.codeHeading')}
        </Text>
        <Text className="font-body text-body-sm text-muted">
          {t('auth.codeSentTo', { phone: fullPhone })}
        </Text>
      </View>
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
        testID="otp-code"
      />
      <AppButton
        label={t('auth.verifyCta')}
        loading={busy}
        disabled={busy || code.trim().length < 4}
        onPress={() => void verify()}
        testID="otp-verify"
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
          testID="otp-resend"
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
    </View>
  );
}
