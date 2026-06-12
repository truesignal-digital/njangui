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
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useColorScheme } from 'react-native';
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
import { Toaster } from 'sonner-native';

import { AppProviders } from '../src/providers/app-providers';
import { getAppTheme } from '../src/lib/theme';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(app)',
  anchor: '(app)',
};

function AppNavigation() {
  const colorScheme = useColorScheme();
  const theme = getAppTheme(colorScheme === 'dark' ? 'dark' : 'light');
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
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
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
      </Stack>
      <Toaster
        position="top-center"
        theme={theme.isDark ? 'dark' : 'light'}
        duration={2000}
        closeButton={false}
      />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppProviders>
          <BottomSheetModalProvider>
            <AppNavigation />
          </BottomSheetModalProvider>
        </AppProviders>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
