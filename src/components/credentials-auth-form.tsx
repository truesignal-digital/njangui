import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSignIn, useSignUp } from '../lib/clerk-client';
import { haptics } from '../lib/haptics';
import { AppButton } from './ui/button';
import { TextField } from './ui/text-field';

type Mode = 'signIn' | 'signUp';

// Clerk API error code → i18n key. Anything unmapped falls back to
// common.error; the code is preserved in the console for debugging.
const CLERK_ERROR_KEYS: Record<string, string> = {
  form_identifier_not_found: 'auth.userNotFound',
  form_password_incorrect: 'auth.badPassword',
  form_identifier_exists: 'auth.usernameTaken',
  form_username_invalid_length: 'auth.usernameInvalid',
  form_username_invalid_character: 'auth.usernameInvalid',
  form_param_format_invalid: 'auth.usernameInvalid',
  form_password_length_too_short: 'auth.passwordTooShort',
  form_password_pwned: 'auth.passwordPwned',
};

function clerkErrorKey(err: unknown): string {
  const code = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
  if (code && CLERK_ERROR_KEYS[code]) {
    return CLERK_ERROR_KEYS[code];
  }
  console.warn('clerk auth error', code ?? err);
  return 'common.error';
}

/**
 * Username + password sign-in / sign-up (Clerk password strategy, legacy
 * resource hooks). The username is the unique app-wide identifier; the
 * phone is OPTIONAL and gets attached later from the profile via a
 * WhatsApp possession proof (linkPhone) — that verify, not signup, is what
 * links feature-phone memberships.
 */
export function CredentialsAuthForm() {
  const { t } = useTranslation();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } = useSignUp();

  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignIn = mode === 'signIn';
  const ready = isSignIn ? signInLoaded && !!signIn : signUpLoaded && !!signUp;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignIn) {
        const attempt = await signIn!.create({
          identifier: username.trim(),
          password,
        });
        if (attempt.status === 'complete' && setActive) {
          haptics.success();
          await setActive({ session: attempt.createdSessionId });
          return;
        }
      } else {
        const attempt = await signUp!.create({
          username: username.trim(),
          password,
        });
        if (attempt.status === 'complete' && setActiveFromSignUp) {
          haptics.success();
          await setActiveFromSignUp({ session: attempt.createdSessionId });
          return;
        }
      }
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-md px-lg">
      <View className="gap-xs">
        <Text className="font-heading text-title text-foreground">
          {t(isSignIn ? 'auth.signInHeading' : 'auth.signUpHeading')}
        </Text>
        <Text className="font-body text-body-sm text-muted">
          {t(isSignIn ? 'auth.signInDesc' : 'auth.signUpDesc')}
        </Text>
      </View>

      <TextField
        label={t('auth.usernameLabel')}
        value={username}
        onChangeText={(text) => {
          setUsername(text);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        testID="auth-username"
      />
      <View className="gap-xs">
        <TextField
          label={t('auth.passwordLabel')}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(null);
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          error={error}
          testID="auth-password"
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPassword((s) => !s)}
          className="self-end py-xs"
          testID="auth-toggle-password"
        >
          <Text className="font-body-medium text-body-sm text-muted">
            {t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
          </Text>
        </Pressable>
      </View>

      <AppButton
        label={t(isSignIn ? 'auth.signInCta' : 'auth.signUpCta')}
        loading={busy}
        disabled={busy || username.trim().length === 0 || password.length === 0}
        onPress={() => void submit()}
        testID="auth-submit"
      />

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          setMode(isSignIn ? 'signUp' : 'signIn');
          setError(null);
        }}
        className="items-center py-xs"
        testID="auth-switch-mode"
      >
        <Text className="font-body-medium text-body-sm text-accent">
          {t(isSignIn ? 'auth.switchToSignUp' : 'auth.switchToSignIn')}
        </Text>
      </Pressable>
    </View>
  );
}
