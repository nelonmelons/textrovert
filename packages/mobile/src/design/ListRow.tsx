import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { radii, space } from './tokens';

/** An iOS inset-grouped section: optional header and footer around a rounded card of rows with inset separators. */
export function ListSection({ header, footer, children, inset = 64 }: { header?: string; footer?: string; children: ReactNode; inset?: number }) {
  const { c, scheme, shadow } = useDesign();
  const rows = Children.toArray(children);
  return (
    <View style={{ gap: space.sm }}>
      {header ? (
        <Txt variant="footnote" tone="secondary" style={{ paddingHorizontal: space.lg, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {header}
        </Txt>
      ) : null}
      <View style={{ backgroundColor: c.surface, borderRadius: radii.lg + 4, borderCurve: 'continuous', overflow: 'hidden', boxShadow: scheme === 'light' ? shadow.card : undefined }}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i ? <View style={{ height: 0.5, backgroundColor: c.separator, marginLeft: inset }} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Txt variant="footnote" tone="secondary" style={{ paddingHorizontal: space.lg }}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}

/** One row: a leading avatar or tile, a title and subtitle, a trailing value, and a chevron when it opens something. */
export function ListRow({ title, subtitle, leading, value, trailing, onPress, chevron = !!onPress }: { title: string; subtitle?: string; leading?: ReactNode; value?: string; trailing?: ReactNode; onPress?: () => void; chevron?: boolean }) {
  const { c } = useDesign();
  return (
    <PressScale onPress={onPress} scale={0.985} accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60, paddingVertical: 10, backgroundColor: c.surface }}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="body" numberOfLines={1} style={{ fontWeight: '500' }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="secondary" numberOfLines={1} style={{ fontSize: 14 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="body" tone="secondary">
          {value}
        </Txt>
      ) : null}
      {trailing}
      {chevron ? (
        <Txt variant="title3" tone="tertiary" style={{ fontWeight: '500', marginLeft: -2 }}>
          ›
        </Txt>
      ) : null}
    </PressScale>
  );
}
