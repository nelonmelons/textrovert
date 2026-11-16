import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, Sticker, type SceneName } from './Backdrop';
import { BackButton } from './Buttons';
import { Txt } from './Txt';
import { space } from './tokens';

/**
 * A scrolling page on a Ditto photograph with the 16pt gutter. scene picks the photograph; back adds the glass back
 * button and an optional title in a top bar.
 */
export function Screen({ children, scene = 'sky', scrim, scroll = true, bottomInset = 0, contentStyle, overlay, back, title, trailing }: { children: ReactNode; grouped?: boolean; scene?: SceneName; scrim?: number; scroll?: boolean; bottomInset?: number; contentStyle?: StyleProp<ViewStyle>; overlay?: ReactNode; back?: boolean; title?: string; trailing?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = { paddingTop: insets.top + (back ? 72 : space.xl), paddingBottom: insets.bottom + space.huge + bottomInset, paddingHorizontal: space.gutter, gap: space.xxl };
  return (
    <View style={{ flex: 1 }}>
      <Backdrop scene={scene} scrim={scrim} />
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, contentStyle]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {back ? <TopBar title={title} trailing={trailing} /> : null}
      {overlay}
    </View>
  );
}

/** The pushed-screen top bar: glass back button, a centred title, and an optional trailing control. */
export function TopBar({ title, trailing, leading }: { title?: string; trailing?: ReactNode; leading?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + space.md, paddingBottom: space.md, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center' }}>
      <LinearGradient pointerEvents="none" colors={['rgba(12, 34, 80, 0.45)', 'rgba(12, 34, 80, 0.18)', 'rgba(12, 34, 80, 0)']} locations={[0, 0.6, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -24 }} />
      <View style={{ width: 88, alignItems: 'flex-start' }}>{leading ?? <BackButton />}</View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? (
          <Txt variant="headline" shadow numberOfLines={1} style={{ fontSize: 17 }}>
            {title}
          </Txt>
        ) : null}
      </View>
      <View style={{ width: 88, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}

/** A page title in Spencer with Ditto's title shadow, optional eyebrow, sub-copy and a trailing accessory. */
export function LargeTitle({ title, eyebrow, subtitle, trailing, center = false, size = 'largeTitle' }: { title: string; eyebrow?: string; subtitle?: string; trailing?: ReactNode; center?: boolean; size?: 'largeTitle' | 'display' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
      <View style={{ flex: 1, gap: space.sm, alignItems: center ? 'center' : 'flex-start' }}>
        {eyebrow ? <Eyebrow text={eyebrow} /> : null}
        <Txt accessibilityRole="header" variant={size} style={{ textAlign: center ? 'center' : 'left' }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="callout" tone="secondary" shadow style={{ textAlign: center ? 'center' : 'left', lineHeight: 22, maxWidth: 340 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/**
 * A section or card label. By default it is the frontpage's black sticker (white Spencer, last word in pink); given a
 * color, or plain, it is small spaced caps instead, for overlines like a date.
 */
export function Eyebrow({ text, color, plain, accent }: { text: string; color?: string; plain?: boolean; accent?: string }) {
  if (!color && !plain) return <Sticker text={text} accent={accent} size={16} />;
  return (
    <Txt variant="caption" tone="secondary" color={color} shadow style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
      {text}
    </Txt>
  );
}

/** A compact top bar: leading, centred title, trailing. */
export function Header({ title, leading, trailing }: { title?: string; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>{leading}</View>
      {title ? (
        <Txt variant="headline" shadow>
          {title}
        </Txt>
      ) : null}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}

/** A section heading inside a page: the frontpage's black sticker, with an optional action on the right. */
export function SectionTitle({ title, action, onAction, accent }: { title: string; action?: string; onAction?: () => void; accent?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -space.xs }}>
      <Sticker text={title} accent={accent} size={24} />
      {action ? (
        <Txt variant="subhead" shadow onPress={onAction} style={{ fontWeight: '700' }}>
          {action}
        </Txt>
      ) : null}
    </View>
  );
}
