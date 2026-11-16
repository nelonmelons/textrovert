import { StyleSheet, Text, View } from 'react-native';
import { Friend, firstName } from '../fixtures';
import { Rounded, Theme, Type } from '../theme';
import { Symbol } from './Paper';

export function WrappedEntry({ friend }: { friend: Friend }) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`Your Wrapped with ${firstName(friend)}, standout moments from your chats`}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Symbol name="sparkles" size={20} color={Theme.celebrateTone.fill} weight="bold" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[Type.headline, { fontFamily: Rounded.bold, color: '#FFFFFF' }]}>Your Wrapped with {firstName(friend)}</Text>
        <Text style={[Type.subheadline, { color: 'rgba(255, 255, 255, 0.8)' }]}>Standout moments from your chats</Text>
      </View>
      <Symbol name="chevron.right" size={12} color="rgba(255, 255, 255, 0.85)" weight="bold" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Theme.coralTone.ink,
    shadowColor: Theme.coralTone.ink,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)' },
});
