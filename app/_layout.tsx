import '../global.css';

import { useEffect, useMemo } from 'react';
import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavLightTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Newsreader_600SemiBold,
  Newsreader_700Bold,
} from '@expo-google-fonts/newsreader';
import { Toaster } from 'sonner-native';

import * as Sentry from '@sentry/react-native';

import { AppProviders } from '@/providers/app-providers';
import { useAppTheme } from '@/lib/theme';
import { useThemePreference } from '@/lib/theme-preference';

Sentry.init({
  // DSN is a public identifier, safe in source.
  dsn: 'https://0204131df81d36de66f0ad72ac4f296d@o4510739308019712.ingest.us.sentry.io/4511675500396544',
  // Dev crashes stay in the terminal; only built apps report.
  enabled: !__DEV__,
  // Tiny user base — capture every error until volume forces sampling.
  sampleRate: 1.0,
  // Money app: no IP/device identifiers attached to events.
  sendDefaultPii: false,
  enableLogs: false,
});

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(app)',
  anchor: '(app)',
};

function AppNavigation() {
  const theme = useAppTheme();
  const { hydrated: themeHydrated } = useThemePreference();
  const navigationTheme = useMemo<typeof NavLightTheme>(() => {
    const base = theme.isDark ? NavDarkTheme : NavLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.background,
        card: theme.surface,
        text: theme.text,
        border: theme.border,
        primary: theme.accent,
        notification: theme.destructive,
      },
    };
  }, [theme]);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    Newsreader_600SemiBold,
    Newsreader_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && themeHydrated) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, themeHydrated]);

  if (!fontsLoaded || !themeHydrated) {
    return null;
  }

  return (
    <NavThemeProvider value={navigationTheme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="g/[shareCode]" />
        <Stack.Screen name="prototypes/groups" />
      </Stack>
      {/* 3.5s + close button: FR strings run long and low-end devices render
          slow — a toast the user can't finish reading is no feedback at all. */}
      <Toaster
        position="top-center"
        theme={theme.isDark ? 'dark' : 'light'}
        duration={3500}
        closeButton
      />
    </NavThemeProvider>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppProviders>
          <AppNavigation />
        </AppProviders>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
});
