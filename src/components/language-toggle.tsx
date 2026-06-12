import { Pressable, Text, View } from 'react-native';
import { useConvexAuth, useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { setStoredAppLanguage } from '../lib/app-language';
import { appLocales, parseAppLocale, type AppLocale } from '../lib/app-locale';
import { cn } from '../lib/cn';
import { api } from '../lib/convex-api';
import { haptics } from '../lib/haptics';

/**
 * FR/EN toggle (docs/03 B10). Persists the choice locally and, when signed
 * in, syncs users.language so notifications speak the right language.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useConvexAuth();
  const updateLanguage = useMutation(api.users.updateLanguage);
  const current = parseAppLocale(i18n.language);

  const setLanguage = (locale: AppLocale) => {
    if (locale === current) return;
    haptics.select();
    void i18n.changeLanguage(locale);
    void setStoredAppLanguage(locale);
    if (isAuthenticated) {
      void updateLanguage({ language: locale }).catch(() => {
        // Local switch already happened; server sync retries next toggle.
      });
    }
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Language"
      className={cn(
        'flex-row items-center gap-1 self-start rounded-pill border border-border bg-surface-muted p-1',
        className
      )}
    >
      {appLocales.map((locale) => (
        <Pressable
          key={locale}
          accessibilityRole="radio"
          accessibilityState={{ selected: current === locale }}
          onPress={() => setLanguage(locale)}
          className={cn(
            'min-w-[48px] items-center rounded-pill px-sm py-[6px]',
            current === locale ? 'bg-accent' : 'bg-transparent'
          )}
        >
          <Text
            className={cn(
              'font-body-semi text-caption uppercase',
              current === locale ? 'text-primary-fg' : 'text-muted'
            )}
          >
            {locale}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
