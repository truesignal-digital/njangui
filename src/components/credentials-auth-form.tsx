import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';

import { useSignIn, useSignUp, useSSO } from '@/lib/clerk-client';
import { haptics } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { generateUsername } from '@/lib/username';
import { AppButton } from './ui/button';
import { TextField } from './ui/text-field';

type Mode =
  | 'signIn'
  | 'signUp'
  | 'verifyEmail'
  | 'forgot'
  | 'forgotReset'
  | 'signInEmailCode';

// Clerk API error code → i18n key. Anything unmapped falls back to
// common.error; the code is preserved in the console for debugging.
const CLERK_ERROR_KEYS: Record<string, string> = {
  form_identifier_not_found: 'auth.userNotFound',
  form_password_incorrect: 'auth.badPassword',
  form_username_invalid_length: 'auth.usernameInvalid',
  form_username_invalid_character: 'auth.usernameInvalid',
  form_password_length_too_short: 'auth.passwordTooShort',
  form_password_pwned: 'auth.passwordPwned',
  form_code_incorrect: 'auth.codeInvalid',
  verification_expired: 'auth.codeExpired',
  form_param_format_invalid: 'auth.emailInvalid',
};

type ClerkError = { errors?: { code?: string; meta?: { param_name?: string } }[] };

function clerkErrorKey(err: unknown): string {
  const first = (err as ClerkError)?.errors?.[0];
  if (first?.code === 'form_identifier_exists') {
    return first.meta?.param_name === 'email_address'
      ? 'auth.emailTaken'
      : 'auth.usernameTaken';
  }
  if (first?.code && CLERK_ERROR_KEYS[first.code]) {
    return CLERK_ERROR_KEYS[first.code];
  }
  console.warn('clerk auth error', first?.code ?? err);
  return 'common.error';
}

function isUsernameTaken(err: unknown): boolean {
  const first = (err as ClerkError)?.errors?.[0];
  return (
    first?.code === 'form_identifier_exists' &&
    first.meta?.param_name === 'username'
  );
}

// signUp.update({ username }) collisions come back as form_identifier_exists
// but WITHOUT meta.param_name — and username is the only identifier that
// call submits, so the bare code is enough to retry on.
function isIdentifierExists(err: unknown): boolean {
  return (err as ClerkError)?.errors?.[0]?.code === 'form_identifier_exists';
}

/**
 * Username/email + password auth. Sign-up asks for the person's NAME, not
 * a username — the unique username is generated from it (prenom.nom, with
 * digit suffixes on collision) and becomes their login + the key officers
 * search to add them to groups. Email is optional but carries password
 * recovery, so the form nudges without requiring. Reset = Clerk
 * reset_password_email_code flow.
 */
export function CredentialsAuthForm() {
  const { t } = useTranslation();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [mode, setMode] = useState<Mode>('signIn');
  const [identifier, setIdentifier] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearFieldsError = () => setError(null);

  // ── Sign in ──────────────────────────────────────────────────────────
  const submitSignIn = async () => {
    if (!signInLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.create({
        identifier: identifier.trim().toLowerCase(),
        password,
      });
      if (attempt.status === 'complete' && setActive) {
        haptics.success();
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      // Clerk's client-trust step-up: an email+password sign-in from a
      // device Clerk hasn't seen proves inbox possession once (anti
      // credential-stuffing). Password was already accepted; send the code.
      const factor = ((attempt.supportedFirstFactors ?? []) as {
        strategy: string;
        emailAddressId?: string;
      }[]).find((f) => f.strategy === 'email_code');
      if (
        ((attempt.status as string) === 'needs_client_trust' ||
          (attempt.status as string) === 'needs_first_factor') &&
        factor?.emailAddressId
      ) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
        setCode('');
        setMode('signInEmailCode');
        return;
      }
      console.warn('sign-in unexpected status', attempt.status);
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const submitSignInEmailCode = async () => {
    if (!signInLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: code.trim(),
      });
      if (attempt.status === 'complete' && setActive) {
        haptics.success();
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      console.warn('sign-in code unexpected status', attempt.status);
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  // ── Sign up (username generated from the name) ───────────────────────
  const submitSignUp = async () => {
    if (!signUpLoaded || !signUp) return;
    const prenom = firstName.trim();
    const nom = lastName.trim();
    const mail = email.trim().toLowerCase();
    if (!prenom || !nom) {
      setError(t('auth.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let attempt = null;
      let username = '';
      // Collision retry: regenerate the suffix until Clerk accepts (rare
      // beyond one retry — suffixes are 2 random digits).
      for (let i = 0; i < 5; i++) {
        username = generateUsername(prenom, nom, i);
        try {
          attempt = await signUp.create({
            firstName: prenom,
            lastName: nom,
            username,
            password,
            ...(mail ? { emailAddress: mail } : {}),
          });
          break;
        } catch (err) {
          if (isUsernameTaken(err) && i < 4) continue;
          throw err;
        }
      }
      if (!attempt) {
        setError(t('common.error'));
        return;
      }

      if (attempt.status === 'complete' && setActiveFromSignUp) {
        haptics.success();
        toast.success(t('auth.usernameAssigned', { username }));
        await setActiveFromSignUp({ session: attempt.createdSessionId });
        return;
      }
      // Email provided → Clerk wants it verified before completing.
      if (attempt.status === 'missing_requirements' && mail) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setCode('');
        setMode('verifyEmail');
        return;
      }
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const submitEmailVerification = async () => {
    if (!signUpLoaded || !signUp) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
      if (attempt.status === 'complete' && setActiveFromSignUp) {
        haptics.success();
        if (attempt.username) {
          toast.success(t('auth.usernameAssigned', { username: attempt.username }));
        }
        await setActiveFromSignUp({ session: attempt.createdSessionId });
        return;
      }
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  // ── Google (Clerk SSO) ───────────────────────────────────────────────
  // A Google account arrives with name+email but no username; the instance
  // requires one (it's the login + the add-member search key), so the
  // signup completes with a generated username exactly like the form path.
  // SSO failures surface as toasts, never through `error` — that state
  // renders under the password field, which the Google path doesn't touch.
  const submitGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const {
        createdSessionId,
        setActive: setActiveSSO,
        signUp: ssoSignUp,
        authSessionResult,
      } = await startSSOFlow({
        // Clerk derives the AuthSession redirect URL itself; passing our own
        // would import expo-auth-session at module load, which hard-crashes
        // dev-client builds that predate the ExpoWebBrowser native module.
        strategy: 'oauth_google',
      });
      if (createdSessionId && setActiveSSO) {
        haptics.success();
        await setActiveSSO({ session: createdSessionId });
        return;
      }
      // Closing the browser is a choice, not a failure — no error UI.
      if (authSessionResult && authSessionResult.type !== 'success') {
        return;
      }
      if (ssoSignUp && ssoSignUp.status === 'missing_requirements') {
        for (let i = 0; i < 5; i++) {
          const username = generateUsername(
            ssoSignUp.firstName ?? '',
            ssoSignUp.lastName ?? '',
            i
          );
          try {
            const done = await ssoSignUp.update({ username });
            if (done.status === 'complete' && setActiveFromSignUp) {
              haptics.success();
              toast.success(t('auth.usernameAssigned', { username }));
              await setActiveFromSignUp({ session: done.createdSessionId });
              return;
            }
            break;
          } catch (err) {
            if (isIdentifierExists(err) && i < 4) continue;
            throw err;
          }
        }
      }
      logger.error('Auth: google sso incomplete', {
        signUpStatus: ssoSignUp?.status ?? null,
      });
      haptics.error();
      toast.error(t('auth.googleFailed'));
    } catch (err) {
      logger.error('Auth: google sso failed', { error: err });
      haptics.error();
      toast.error(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  // ── Password reset by email code ─────────────────────────────────────
  const submitForgot = async () => {
    if (!signInLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim().toLowerCase(),
      });
      setCode('');
      setPassword('');
      setMode('forgotReset');
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const submitForgotReset = async () => {
    if (!signInLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
      });
      if (attempt.status === 'needs_new_password') {
        const reset = await signIn.resetPassword({
          password,
          signOutOfOtherSessions: true,
        });
        if (reset.status === 'complete' && setActive) {
          haptics.success();
          toast.success(t('auth.resetSuccess'));
          await setActive({ session: reset.createdSessionId });
          return;
        }
      } else if (attempt.status === 'complete' && setActive) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      setError(t('common.error'));
    } catch (err) {
      setError(t(clerkErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  // ── UI pieces ────────────────────────────────────────────────────────
  const passwordField = (autoComplete: 'current-password' | 'new-password') => (
    <View className="gap-xs">
      <TextField
        label={
          mode === 'forgotReset' ? t('auth.newPasswordLabel') : t('auth.passwordLabel')
        }
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          clearFieldsError();
        }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
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
  );

  const heading = (
    titleKey: string,
    descKey: string,
    descParams?: Record<string, string>
  ) => (
    <View className="gap-xs">
      <Text className="font-heading text-title text-foreground">{t(titleKey)}</Text>
      <Text className="font-body text-body-sm text-muted">
        {t(descKey, descParams) as string}
      </Text>
    </View>
  );

  const googleBlock = (
    <View className="gap-md">
      <View className="flex-row items-center gap-md">
        <View className="h-[1px] flex-1 bg-border-subtle" />
        <Text className="font-body text-caption text-placeholder">
          {t('auth.orDivider')}
        </Text>
        <View className="h-[1px] flex-1 bg-border-subtle" />
      </View>
      <AppButton
        variant="outline"
        label={t('auth.continueWithGoogle')}
        disabled={busy}
        onPress={() => void submitGoogle()}
        testID="auth-google"
      />
    </View>
  );

  const linkRow = (labelKey: string, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      className="items-center py-xs"
      testID={testID}
    >
      <Text className="font-body-medium text-body-sm text-accent">{t(labelKey)}</Text>
    </Pressable>
  );

  if (mode === 'signUp') {
    return (
      <View className="gap-md px-lg">
        {heading('auth.signUpHeading', 'auth.signUpDesc')}
        <TextField
          label={t('auth.firstNameLabel')}
          value={firstName}
          onChangeText={(text) => {
            setFirstName(text);
            clearFieldsError();
          }}
          autoCapitalize="words"
          autoComplete="given-name"
          testID="auth-first-name"
        />
        <TextField
          label={t('auth.lastNameLabel')}
          value={lastName}
          onChangeText={(text) => {
            setLastName(text);
            clearFieldsError();
          }}
          autoCapitalize="words"
          autoComplete="family-name"
          testID="auth-last-name"
        />
        <TextField
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearFieldsError();
          }}
          placeholder={t('auth.emailOptionalHint')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          testID="auth-email"
        />
        {passwordField('new-password')}
        <AppButton
          label={t('auth.signUpCta')}
          loading={busy}
          disabled={
            busy ||
            firstName.trim().length === 0 ||
            lastName.trim().length === 0 ||
            password.length === 0
          }
          onPress={() => void submitSignUp()}
          testID="auth-submit"
        />
        {linkRow(
          'auth.switchToSignIn',
          () => {
            setMode('signIn');
            setError(null);
          },
          'auth-switch-mode'
        )}
        {googleBlock}
      </View>
    );
  }

  if (mode === 'verifyEmail') {
    return (
      <View className="gap-md px-lg">
        {heading('auth.verifyEmailHeading', 'auth.verifyEmailDesc', {
          email: email.trim().toLowerCase(),
        })}
        <TextField
          label={t('auth.codeLabel')}
          value={code}
          onChangeText={(text) => {
            setCode(text.replace(/[^\d]/g, ''));
            clearFieldsError();
          }}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={8}
          autoComplete="one-time-code"
          error={error}
          testID="auth-email-code"
        />
        <AppButton
          label={t('auth.verifyCta')}
          loading={busy}
          disabled={busy || code.trim().length < 4}
          onPress={() => void submitEmailVerification()}
          testID="auth-verify-email"
        />
      </View>
    );
  }

  if (mode === 'signInEmailCode') {
    return (
      <View className="gap-md px-lg">
        {heading('auth.newDeviceHeading', 'auth.newDeviceDesc')}
        <TextField
          label={t('auth.codeLabel')}
          value={code}
          onChangeText={(text) => {
            setCode(text);
            clearFieldsError();
          }}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={8}
          autoComplete="one-time-code"
          error={error}
          testID="auth-signin-code"
        />
        <AppButton
          label={t('auth.verifyCta')}
          loading={busy}
          disabled={busy || code.trim().length < 4}
          onPress={() => void submitSignInEmailCode()}
          testID="auth-verify-signin-code"
        />
        {linkRow(
          'auth.backToSignIn',
          () => {
            setMode('signIn');
            setError(null);
          },
          'auth-back-signin'
        )}
      </View>
    );
  }

  if (mode === 'forgot') {
    return (
      <View className="gap-md px-lg">
        {heading('auth.resetHeading', 'auth.resetDesc')}
        <TextField
          label={t('auth.emailAccountLabel')}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearFieldsError();
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          error={error}
          testID="auth-reset-email"
        />
        <AppButton
          label={t('auth.sendResetCode')}
          loading={busy}
          disabled={busy || !email.trim().includes('@')}
          onPress={() => void submitForgot()}
          testID="auth-send-reset"
        />
        {linkRow(
          'auth.backToSignIn',
          () => {
            setMode('signIn');
            setError(null);
          },
          'auth-back-signin'
        )}
      </View>
    );
  }

  if (mode === 'forgotReset') {
    return (
      <View className="gap-md px-lg">
        {heading('auth.resetHeading', 'auth.resetCodeDesc', {
          email: email.trim().toLowerCase(),
        })}
        <TextField
          label={t('auth.codeLabel')}
          value={code}
          onChangeText={(text) => {
            setCode(text.replace(/[^\d]/g, ''));
            clearFieldsError();
          }}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={8}
          autoComplete="one-time-code"
          testID="auth-reset-code"
        />
        {passwordField('new-password')}
        <AppButton
          label={t('auth.resetCta')}
          loading={busy}
          disabled={busy || code.trim().length < 4 || password.length === 0}
          onPress={() => void submitForgotReset()}
          testID="auth-submit-reset"
        />
        {linkRow(
          'auth.backToSignIn',
          () => {
            setMode('signIn');
            setError(null);
          },
          'auth-back-signin'
        )}
      </View>
    );
  }

  return (
    <View className="gap-md px-lg">
      {heading('auth.signInHeading', 'auth.signInDesc')}
      <TextField
        label={t('auth.identifierLabel')}
        value={identifier}
        onChangeText={(text) => {
          setIdentifier(text);
          clearFieldsError();
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        testID="auth-username"
      />
      {passwordField('current-password')}
      <AppButton
        label={t('auth.signInCta')}
        loading={busy}
        disabled={busy || identifier.trim().length === 0 || password.length === 0}
        onPress={() => void submitSignIn()}
        testID="auth-submit"
      />
      <View className="flex-row items-center justify-between">
        {linkRow(
          'auth.forgotPassword',
          () => {
            setMode('forgot');
            setError(null);
          },
          'auth-forgot'
        )}
        {linkRow(
          'auth.switchToSignUp',
          () => {
            setMode('signUp');
            setError(null);
          },
          'auth-switch-mode'
        )}
      </View>
      {googleBlock}
    </View>
  );
}
