import { View } from 'react-native';

import { ClerkAuthScreen } from '../../src/components/clerk-auth-screen';
import { DevAuthButton } from '../../src/components/dev/dev-tools';

export default function SignInScreen() {
  return (
    <View className="flex-1">
      <ClerkAuthScreen mode="signInOrUp" />
      {__DEV__ ? <DevAuthButton /> : null}
    </View>
  );
}
