import { Tabs } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  HomeIcon,
  UserIcon,
  UsersIcon,
} from 'react-native-heroicons/outline';

import { api } from '../../../src/lib/convex-api';
import { useAppTheme } from '../../../src/lib/theme';

/**
 * Resting-state tab shell (docs/03 §A): Accueil · Groupe · À confirmer
 * (badge = claims awaiting me — the guaranteed in-app channel, 03 §E) ·
 * Profil. Everything under groups/ and payments/ pushes onto the stack
 * above these tabs.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const inbox = useQuery(api.paymentRecords.myInbox, isAuthenticated ? {} : 'skip');
  const inboxCount = inbox?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface },
        tabBarLabelStyle: { fontFamily: 'PlusJakartaSans_600SemiBold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          title: t('tabs.group'),
          tabBarIcon: ({ color, size }) => <UsersIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t('tabs.inbox'),
          tabBarIcon: ({ color, size }) => (
            <CheckCircleIcon color={color} size={size} />
          ),
          tabBarBadge: inboxCount > 0 ? inboxCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
