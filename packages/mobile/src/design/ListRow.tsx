import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { Glass } from './Backdrop';
import { Chevron } from './Kit';
import { Eyebrow } from './Screen';
import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { radii, space } from './tokens';

/** A glass card of rows with hairline separators, under optional spaced-caps header and over a footer. */
export function ListSection({ header, footer, children, inset = 16 }: { header?: string; footer?: string; children: ReactNode; inset?: number }) {
  const { c } = useDesign();
  const rows = Children.toArray(children);
  return (
    <View style={{ gap: space.sm }}>
      {header ? (
        <View style={{ paddingHorizontal: space.xs }}>
          <Eyebrow text={header} />
        </View>
      ) : null}
      <Glass tone="dark" radius={radii.xl}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i ? <View style={{ height: 0.5, backgroundColor: c.separator, marginLeft: inset, marginRight: 16 }} /> : null}
            {row}
          </Fragment>
        ))}
      </Glass>
      {footer ? (
        <Txt variant="footnote" tone="secondary" shadow style={{ paddingHorizontal: space.xs }}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}

/** One row: a leading avatar or tile, a title and subtitle, a trailing value, and a chevron when it opens something. */
export function ListRow({ title, subtitle, leading, value, trailing, onPress, chevron = !!onPress }: { title: string; subtitle?: string; leading?: ReactNode; value?: string; trailing?: ReactNode; onPress?: () => void; chevron?: boolean }) {
  return (
    <PressScale onPress={onPress} scale={0.985} accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60, paddingVertical: 12 }}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="secondary" numberOfLines={1}>
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
      {chevron ? <Chevron /> : null}
    </PressScale>
  );
}
