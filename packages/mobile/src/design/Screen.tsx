import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesign } from './theme';
import { Txt } from './Txt';
import { space } from './tokens';

/** A scrolling page on the canvas colour with the 20pt gutter. grouped uses the iOS grouped grey for list pages. */
export function Screen({ children, grouped = false, scroll = true, bottomInset = 0, contentStyle, overlay }: { children: ReactNode; grouped?: boolean; scroll?: boolean; bottomInset?: number; contentStyle?: StyleProp<ViewStyle>; overlay?: ReactNode }) {
  const { c } = useDesign();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.huge + bottomInset, paddingHorizontal: space.gutter, gap: space.xxl };
  return (
    <View style={{ flex: 1, backgroundColor: grouped ? c.grouped : c.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, contentStyle]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {overlay}
    </View>
  );
}

/** A big tight page title with optional eyebrow, muted sub-copy and a trailing accessory. */
export function LargeTitle({ title, eyebrow, subtitle, trailing, center = false, size = 'largeTitle' }: { title: string; eyebrow?: string; subtitle?: string; trailing?: ReactNode; center?: boolean; size?: 'largeTitle' | 'display' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
      <View style={{ flex: 1, gap: space.xs, alignItems: center ? 'center' : 'flex-start' }}>
        {eyebrow ? (
          <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {eyebrow}
          </Txt>
        ) : null}
        <Txt accessibilityRole="header" variant={size} style={{ textAlign: center ? 'center' : 'left' }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="callout" tone="secondary" style={{ marginTop: space.xs, textAlign: center ? 'center' : 'left', lineHeight: 23 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** A compact top bar: leading, centred title, trailing. */
export function Header({ title, leading, trailing }: { title?: string; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>{leading}</View>
      {title ? <Txt variant="headline">{title}</Txt> : null}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}

/** A section heading inside a page, with an optional action on the right. */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -space.sm }}>
      <Txt variant="title2">{title}</Txt>
      {action ? (
        <Txt variant="subhead" tone="accent" onPress={onAction} style={{ fontWeight: '600' }}>
          {action}
        </Txt>
      ) : null}
    </View>
  );
}
