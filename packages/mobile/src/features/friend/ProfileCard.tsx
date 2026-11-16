import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { Glass, space, Sticker } from '@/design';

/**
 * A profile section, set like the frontpage's: a black sticker label (last word in pink) overlapping the top edge of a
 * liquid-glass card, an optional action on the right, then the rows. symbol and tint are kept for callers.
 */
export function ProfileCard({ title, action, children }: { title: string; symbol?: SymbolViewProps['name']; tint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: -14, zIndex: 2, minHeight: 32 }}>
        <Sticker text={title} size={19} />
        {action}
      </View>
      <Glass tone="dark" radius={24} style={{ padding: space.lg, paddingTop: 26, gap: space.md }}>
        {children}
      </Glass>
    </View>
  );
}
