import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../lib/theme';

/**
 * Opaque strip under the status bar / Dynamic Island for screens without a
 * native header: scrolled content slides beneath it instead of colliding
 * with system chrome. Render as the LAST child of the screen wrapper so it
 * stacks above the scroll view. Style-track (not className) on purpose:
 * explicit zIndex/elevation must beat list cells on both platforms.
 */
export function StatusBarCover() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  if (insets.top === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: theme.background,
        zIndex: 10,
        elevation: 10,
      }}
    />
  );
}
