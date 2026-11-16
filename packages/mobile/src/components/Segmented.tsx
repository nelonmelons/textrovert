import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptics } from '../lib/haptics';
import { Theme, Type } from '../theme';

/** Two or three options in a capsule, like the SwiftUI segmented pickers in Emma's app. */
export function Segmented<T extends string>({ options, value, onChange, dark = false }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; dark?: boolean }) {
  return (
    <View style={[styles.track, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptics.select();
              onChange(o.id);
            }}
            style={[styles.option, on && { backgroundColor: dark ? '#FFFFFF' : Theme.background, shadowOpacity: 0.08 }]}
          >
            <Text style={[Type.subheadline, { fontWeight: '600', color: on ? Theme.accent : dark ? 'rgba(255,255,255,0.75)' : Theme.secondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: Theme.tertiaryFill },
  option: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 999, shadowColor: '#000', shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0 },
});
