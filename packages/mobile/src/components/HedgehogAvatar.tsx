import { Image, View } from 'react-native';

import { useTheme } from '@/theme';

/** The assistant's face: the hedgehog mark tinted with a section color on its fill. */
export function HedgehogAvatar({ size = 34, tone }: { size?: number; tone?: { ink: string; fill: string } }) {
  const theme = useTheme();
  const t = tone ?? theme.tones.accent;
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={require('../../assets/hedgehog-mark.png')} resizeMode="contain" style={{ width: size - 12, height: size - 12, tintColor: t.ink }} />
    </View>
  );
}
