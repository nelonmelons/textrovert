import { Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from './Kit';
import { contactGradient, type FillName } from './tokens';

export interface EmojiAvatarProps {
  name?: string;
  emoji?: string;
  image?: ImageSourcePropType;
  /** Ignored: every avatar is Messages' grey contact avatar. */
  color?: FillName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Messages' contact avatar: initials, an image, or an emoji, on the grey gradient. */
export function EmojiAvatar({ name, emoji, image, size = 44, style }: EmojiAvatarProps) {
  if (!emoji || image) return <Avatar name={name ?? emoji ?? ''} image={image} size={size} style={style} />;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', boxShadow: '0px 1px 4px rgba(12, 34, 80, 0.3)' }, style]}>
      <LinearGradient colors={contactGradient} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.48, lineHeight: size * 0.6 }}>{emoji}</Text>
      </LinearGradient>
    </View>
  );
}

/** Overlapping contact avatars, the first on top, with a "+N" when there are more. */
export function AvatarStack({ people, size = 44, max = 7, overlap = 0.26, style }: { people: EmojiAvatarProps[]; size?: number; max?: number; overlap?: number; bounce?: boolean; style?: StyleProp<ViewStyle> }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {shown.map((p, i) => (
        <View key={i} style={{ marginLeft: i ? -size * overlap : 0, zIndex: shown.length - i, borderRadius: size / 2, borderWidth: 2, borderColor: 'rgba(1, 30, 44, 0.9)' }}>
          <EmojiAvatar {...p} size={size} />
        </View>
      ))}
      {rest > 0 ? (
        <View style={{ marginLeft: -size * overlap, width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: size * 0.3, fontWeight: '600' }}>+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}
