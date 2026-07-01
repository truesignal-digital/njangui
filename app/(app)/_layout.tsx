import { Fragment } from 'react';
import { Stack } from 'expo-router';

import { DevSeedButton } from '../../src/components/dev/dev-tools';

export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * Authed-area stack. Join-by-code and feature-phone add are presented
 * workflows (piol's mobile-presented-workflows pattern, inlined while the
 * app has only two modals).
 */
export default function AppLayout() {
  return (
    <Fragment>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="groups/new" />
        <Stack.Screen name="groups/[groupId]/index" />
        <Stack.Screen name="groups/[groupId]/rounds/[roundId]/index" />
        <Stack.Screen
          name="groups/[groupId]/rounds/[roundId]/pay/index"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="groups/[groupId]/rounds/[roundId]/pay/ussd"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="groups/[groupId]/rounds/[roundId]/pay/claim"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="groups/[groupId]/start-cycle"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="join-by-code"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="groups/[groupId]/add-member"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
      </Stack>
      {__DEV__ ? <DevSeedButton /> : null}
    </Fragment>
  );
}
