// Placeholder: Material Symbols Outlined "work" (Apache-2.0). See ./index.ts.
import Svg, { Path } from 'react-native-svg';

import type { PictogramArtProps } from './types';

export function SalairePictogram({ size, color }: PictogramArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d="M160-120q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720h160v-80q0-33 23.5-56.5T400-880h160q33 0 56.5 23.5T640-800v80h160q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160Zm0-80h640v-440H160v440Zm240-520h160v-80H400v80ZM160-200v-440 440Z" fill={color} />
    </Svg>
  );
}
