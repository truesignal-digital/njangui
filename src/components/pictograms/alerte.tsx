// Placeholder: Material Symbols Outlined "warning" (Apache-2.0). See ./index.ts.
import Svg, { Path } from 'react-native-svg';

import type { PictogramArtProps } from './types';

export function AlertePictogram({ size, color }: PictogramArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z" fill={color} />
    </Svg>
  );
}
