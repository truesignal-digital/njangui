import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { JoinInvitationFlow } from '@/components/groups/join-invitation-flow';
import { useAppTheme } from '@/lib/theme';

export default function JoinByCodeModal() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: theme.spacing.xl,
        paddingBottom: insets.bottom + theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={62}
    >
      <View className="pt-xs">
        <JoinInvitationFlow onClose={close} />
      </View>
    </KeyboardAwareScrollView>
  );
}
