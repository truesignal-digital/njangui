// Placeholder: Material Symbols Outlined "send" (Apache-2.0). See ./index.ts.
import Svg, { Path } from 'react-native-svg';

import type { PictogramArtProps } from './types';

export function EnvoiPictogram({ size, color }: PictogramArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z" fill={color} />
    </Svg>
  );
}
