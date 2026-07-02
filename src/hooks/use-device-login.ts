import { useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api } from '../lib/convex-api';
import { useSignIn } from '../lib/clerk-client';
import {
  clearDeviceSecret,
  getOrCreateDeviceId,
  readDeviceSecret,
} from '../lib/device-credential';

export type DeviceLoginStatus = 'idle' | 'trying' | 'failed';

/**
 * Silent re-auth (auth spec, the cost-saver): biometric-read the device
 * secret → api.otp.deviceLogin → Clerk ticket → session. NO WhatsApp
 * message. Any failure (no credential, gate refused, revoked, stale)
 * resolves to 'failed' and the OTP screen takes over — one re-enrollment,
 * never a crash.
 */
export function useDeviceLogin(enabled: boolean): DeviceLoginStatus {
  const { t } = useTranslation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const deviceLogin = useAction(api.otp.deviceLogin);
  const [status, setStatus] = useState<DeviceLoginStatus>('idle');
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isLoaded || !signIn || attemptedRef.current) return;
    attemptedRef.current = true;
    setStatus('trying');

    void (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const secret = await readDeviceSecret(t('auth.biometricPrompt'));
        if (!secret) {
          setStatus('failed');
          return;
        }
        const result = await deviceLogin({ deviceId, deviceSecret: secret });
        if (!result.ok) {
          // Revoked / stale / unknown — burn the local copy so we don't
          // re-prompt biometrics for a dead credential on every launch.
          await clearDeviceSecret();
          setStatus('failed');
          return;
        }
        const attempt = await signIn.create({
          strategy: 'ticket',
          ticket: result.ticket,
        });
        if (attempt.status === 'complete' && setActive) {
          await setActive({ session: attempt.createdSessionId });
          setStatus('idle');
        } else {
          setStatus('failed');
        }
      } catch {
        setStatus('failed');
      }
    })();
  }, [enabled, isLoaded, signIn, setActive, deviceLogin, t]);

  return status;
}
