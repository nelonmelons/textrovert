import type { ReactNode } from 'react';
import { Image, Platform, Text, TextInput, View, type ImageSourcePropType, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { Glass } from './Backdrop';
import { Icon } from './Buttons';
import { fonts } from './fonts';
import { contactGradient, ditto, radii, softShadow } from './tokens';

/**
 * The frontpage's smaller pieces: Messages' contact avatar and bubbles (from the hero phone), the Enroll form's card
 * and field, and the pink chevron and count.
 */

const initialsOf = (name: string) =>
  name
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Messages' contact avatar: a grey gradient circle with white initials, or an image. */
export function Avatar({ name = '', image, size = 44, style }: { name?: string; image?: ImageSourcePropType; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View aria-label={name} style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', boxShadow: '0px 1px 4px rgba(12, 34, 80, 0.3)' }, style]}>
      <LinearGradient colors={contactGradient} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <Image source={image} resizeMode="contain" style={{ width: size * 0.62, height: size * 0.62, tintColor: '#FFFFFF' }} />
        ) : !initialsOf(name) ? (
          <Icon name="person.fill" size={size * 0.44} color="#FFFFFF" />
        ) : (
          <Text style={{ fontFamily: fonts.sf, color: '#FFFFFF', fontSize: size * 0.4, lineHeight: size * 0.48, fontWeight: '600', letterSpacing: -0.2 }}>{initialsOf(name)}</Text>
        )}
      </LinearGradient>
    </View>
  );
}

/** The hero phone's contact header: the avatar over "Name ›" in white SF. */
export function ContactHeader({ name, image, onPress }: { name: string; image?: ImageSourcePropType; onPress?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <Avatar name={name} image={image} size={60} />
      <Text onPress={onPress} style={[{ fontFamily: fonts.sf, color: '#FFFFFF', fontSize: 15, fontWeight: '500' }, softShadow]}>
        {name} <Text style={{ opacity: 0.7 }}>›</Text>
      </Text>
    </View>
  );
}

/** Messages' bubble tail (the hero phone's 20×18 hook). */
function Tail({ color, mine }: { color: string; mine: boolean }) {
  return (
    <Svg width={20} height={18} viewBox="0 0 20 18" style={{ position: 'absolute', bottom: 0, [mine ? 'right' : 'left']: -5, transform: mine ? undefined : [{ scaleX: -1 }] }}>
      <Path d="M0 0H15C15 9.5 16.4 14.6 20 17.6C15.6 18.4 11.6 17.7 8.6 15.6C6.1 17.2 3.2 18 0 18Z" fill={color} />
    </Svg>
  );
}

/**
 * A Messages bubble, as the hero phone draws them: received is #E9E9EB with black text, sent is blue (#1F8FFF→#0A7CFF)
 * with white; 17pt SF on a 22pt line, 7×12 padding, 18pt corners, a tail on the last of a run.
 */
export function Bubble({ text, mine = false, tail = true, children, maxWidth = '78%', style }: { text?: string; mine?: boolean; tail?: boolean; children?: ReactNode; maxWidth?: ViewStyle['maxWidth']; style?: StyleProp<ViewStyle> }) {
  const body = (
    <>
      {text ? <Text style={{ fontFamily: fonts.sf, fontSize: 17, lineHeight: 22, letterSpacing: -0.43, color: mine ? '#FFFFFF' : '#000000' }}>{text}</Text> : null}
      {children}
    </>
  );
  return (
    <View style={[{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth, marginHorizontal: 5 }, style]}>
      {tail ? <Tail color={mine ? ditto.bubbleOut : ditto.bubbleIn} mine={mine} /> : null}
      {mine ? (
        <LinearGradient colors={[ditto.bubbleOutTop, ditto.bubbleOut]} style={{ borderRadius: radii.bubble, paddingVertical: 7, paddingHorizontal: 12 }}>
          {body}
        </LinearGradient>
      ) : (
        <View style={{ backgroundColor: ditto.bubbleIn, borderRadius: radii.bubble, paddingVertical: 7, paddingHorizontal: 12 }}>{body}</View>
      )}
    </View>
  );
}

/** The hero phone's timestamp line ("iMessage · Today 6:45 PM"): 11pt white, centred. */
export function Stamp({ children }: { children: ReactNode }) {
  return <Text style={[{ alignSelf: 'center', fontFamily: fonts.sf, fontSize: 11, lineHeight: 14, fontWeight: '500', color: 'rgba(255, 255, 255, 0.88)', textAlign: 'center' }, softShadow]}>{children}</Text>;
}

/** The Enroll card: form glass, 32pt corners, 16pt padding. */
export function FormCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone="light" radius={radii.xxl} style={[{ padding: 16, gap: 10 }, style]}>
      {children}
    </Glass>
  );
}

/** The Enroll field: 46pt, 16pt corners, black/10, white 16pt text, white/50 placeholder. */
export function Field({ center, leading, trailing, containerStyle, style, multiline, ...props }: TextInputProps & { center?: boolean; leading?: ReactNode; trailing?: ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ minHeight: multiline ? 120 : 46, borderRadius: radii.field, backgroundColor: 'rgba(0, 0, 0, 0.1)', paddingHorizontal: 16, flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10 }, containerStyle]}>
      {leading}
      <TextInput
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        selectionColor="#FFFFFF"
        multiline={multiline}
        {...props}
        style={[
          { flex: 1, minWidth: 0, color: '#FFFFFF', fontFamily: fonts.ui, fontSize: 16, paddingVertical: multiline ? 12 : 0, minHeight: multiline ? 96 : 46, textAlign: center ? 'center' : 'left', textAlignVertical: multiline ? 'top' : 'center' },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          style,
        ]}
      />
      {trailing}
    </View>
  );
}

/** Validation copy under a field (the Enroll form's #FFB4B4, 13pt). */
export function FieldError({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: fonts.ui, fontSize: 13, lineHeight: 20, color: ditto.error, textAlign: 'center' }}>{children}</Text>;
}

/** The FAQ's pink chevron. */
export function Chevron({ down = false, size = 16 }: { down?: boolean; size?: number }) {
  return <Icon name={down ? 'chevron.down' : 'chevron.right'} size={size} color={ditto.primary} />;
}

/** A pink count. */
export function Count({ n }: { n: number }) {
  return (
    <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: ditto.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.ui, color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{n}</Text>
    </View>
  );
}
