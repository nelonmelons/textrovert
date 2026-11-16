import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptics } from '../lib/haptics';
import { Glass } from '../design/Backdrop';
import { Type } from '../theme';

/** Ditto selection pills: a white/10 glass track; the chosen option is the white key with pink ink. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; dark?: boolean }) {
  return (
    <Glass tone="light" radius={999}>
      <View style={styles.track} accessibilityRole="tablist">
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
              style={[styles.option, on && styles.on]}
            >
              <Text style={[Type.subheadline, { fontWeight: '700', color: on ? '#FF2CAB' : '#FFFFFF' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4 },
  option: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  on: { backgroundColor: 'rgba(255, 255, 255, 0.95)', boxShadow: '0px 2px 8px rgba(4, 12, 18, 0.18)' },
});
