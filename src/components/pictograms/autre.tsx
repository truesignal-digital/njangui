// Placeholder: Material Symbols Outlined "more_horiz" (Apache-2.0). See ./index.ts.
import Svg, { Path } from 'react-native-svg';

import type { PictogramArtProps } from './types';

export function AutrePictogram({ size, color }: PictogramArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z" fill={color} />
    </Svg>
  );
}
