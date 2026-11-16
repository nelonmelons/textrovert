import { ReactNode } from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Rounded, Theme, Tone, Type, withAlpha } from '../theme';
import { Glass, Sticker } from '../design/Backdrop';
import { Avatar, Bubble as KitBubble } from '../design/Kit';
import { symbolName } from '../design/symbols';
import { deadlineText, Friend } from '../people';

const CELL = 22;

/** Was the graph-paper canvas; Ditto screens sit on photographs instead, so it draws nothing. */
export function GridPaper(_: { width: number; height: number }) {
  return null;
}

export function Symbol({ name, size, color, weight }: { name: SymbolViewProps['name']; size: number; color: string; weight?: SymbolViewProps['weight'] }) {
  return <SymbolView name={symbolName(name)} size={size} tintColor={color} weight={weight ?? 'regular'} resizeMode="scaleAspectFit" style={{ width: size * 1.25, height: size * 1.1 }} />;
}

/** Messages' grey contact avatar with initials. */
export function Face({ initials }: { initials: string }) {
  return <Avatar name={initials.split('').join(' ')} size={44} />;
}

/** A section header: the frontpage's black sticker. symbol and tone are kept for callers. */
export function ToneTab({ title, symbol: _symbol, tone: _tone, style }: { title: string; symbol: SymbolViewProps['name']; tone: Tone; style?: StyleProp<ViewStyle> }) {
  return <Sticker text={title} size={16} style={style} />;
}

/** A liquid-glass card with a faint wash of its section's tone. */
export function SectionCard({ tone, fillOpacity = 0.5, children, style }: { tone: Tone; fillOpacity?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone="dark" radius={24} style={style}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(tone.fill, Math.min(0.14, fillOpacity * 0.2)) }]} />
      <View style={{ padding: 16 }}>{children}</View>
    </Glass>
  );
}

/** The FAQ's pink chevron. */
export function RowChevron() {
  return <Symbol name="chevron.right" size={14} color={Theme.accent} weight="semibold" />;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: Theme.separator }} />;
}

export function DeadlineBadge({ deadline }: { deadline: Date }) {
  const { text, urgent } = deadlineText(deadline);
  return (
    <View style={[styles.badge, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: urgent ? Theme.accent : 'rgba(255, 255, 255, 0.45)' }]}>
      <Symbol name="clock" size={13} color={urgent ? Theme.accent : Theme.ink} weight="medium" />
      <Text style={[Type.footnote, { color: urgent ? Theme.accent : Theme.ink, fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}

export const art = {
  mark: require('../../assets/art/hedgehog-mark.png'),
  toast: require('../../assets/art/hedgehog-toast.png'),
  bird: require('../../assets/art/hedgehog-bird.png'),
  leaf: require('../../assets/art/hedgehog-leaf.png'),
  dance: require('../../assets/art/hedgehog-dance.png'),
  wave: require('../../assets/art/hedgehog-wave.png'),
};

export const serviceSymbol = (service: string): SymbolViewProps['name'] => (service === 'Instagram' ? 'camera' : service === 'WhatsApp' ? 'phone.bubble' : 'message');

export function ServiceIcon({ service }: { service: string }) {
  return <Symbol name={serviceSymbol(service)} size={12} color={Theme.secondary} weight="semibold" />;
}

export function SourceHeader({ friend }: { friend: Friend }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
      <Face initials={friend.initials} />
      <View style={{ gap: 2, flex: 1 }}>
        <Text style={[Type.title2, { fontFamily: Rounded.bold, color: Theme.ink }]}>{friend.name}</Text>
        <Text style={[Type.subheadline, { color: Theme.secondary }]}>{friend.handle}</Text>
      </View>
    </View>
  );
}

/** A Messages bubble with its meta line under it; cited ones get a pink ring. */
export function Bubble({ text, meta, service, fromMe, cited }: { text: string; meta: string; service?: string; fromMe?: boolean; cited?: boolean }) {
  return (
    <View style={{ alignItems: fromMe ? 'flex-end' : 'flex-start', gap: 4 }}>
      <KitBubble text={text} mine={fromMe} style={cited ? { borderRadius: 18, borderWidth: 2, borderColor: Theme.accent } : undefined} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 17 }}>
        {cited ? <Text style={[Type.caption, { color: Theme.accent, fontWeight: '600' }]}>Used in the reading ·</Text> : null}
        {service ? <ServiceIcon service={service} /> : null}
        <Text style={[Type.caption, { color: Theme.secondary }]}>{meta}</Text>
      </View>
    </View>
  );
}


export function HedgehogMark({ height, color = '#FFFFFF' }: { height: number; color?: string }) {
  return <Image source={art.mark} style={{ height, width: height * 1.3, tintColor: color }} resizeMode="contain" />;
}

/** Textrovert as a Messages contact: the hedgehog mark on the grey contact avatar. */
export function HedgehogAvatar() {
  return <Avatar name="Textrovert" image={art.mark} size={34} />;
}

export const roundedText = (weight: 'bold' | 'heavy') => ({ fontFamily: Rounded[weight] });

const styles = StyleSheet.create({
  faceRing: {
    padding: 2,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  face: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 22,
  },
  tabText: { ...Type.caption2, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 6,
  },
  bubbleMine: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderWidth: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
});
