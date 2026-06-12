import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { getStoredAppLanguage } from './app-language';
import { defaultLocale, parseAppLocale } from './app-locale';
import { localeResources } from './locales';

if (!i18n.isInitialized) {
  const deviceLocale = getLocales()[0]?.languageCode;

  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources: localeResources,
    lng: parseAppLocale(deviceLocale),
    fallbackLng: defaultLocale,
    interpolation: {
      escapeValue: false,
    },
  });

  // Async overlay: a previously chosen FR/EN toggle wins over the device locale.
  void getStoredAppLanguage().then((stored) => {
    if (stored && stored !== parseAppLocale(i18n.language)) {
      void i18n.changeLanguage(stored);
    }
  });
}

export { i18n };
