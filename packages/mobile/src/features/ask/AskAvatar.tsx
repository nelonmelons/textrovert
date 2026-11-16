import { Image, View } from 'react-native';

import { ditto } from '@/design';

const mark = require('../../../assets/art/hedgehog-mark.png');

/** Ask's avatar: the hedgehog mark in white on a Ditto-pink circle with a hairline highlight and a soft pink glow. */
export function AskAvatar({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <View
      accessibilityLabel="Textrovert"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ditto.pink,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.7)',
        borderLeftColor: 'rgba(255, 255, 255, 0.45)',
        borderRightColor: 'rgba(255, 255, 255, 0.15)',
        borderBottomColor: 'rgba(255, 255, 255, 0.2)',
        boxShadow: glow ? '0px 0px 28px rgba(255, 44, 171, 0.6), 0px 8px 20px rgba(4, 12, 18, 0.25)' : '0px 4px 12px rgba(4, 12, 18, 0.22)',
      }}>
      <Image source={mark} resizeMode="contain" style={{ width: size * 0.62, height: size * 0.48, tintColor: '#FFFFFF' }} />
    </View>
  );
}
