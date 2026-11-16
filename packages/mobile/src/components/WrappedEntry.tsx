import { View } from 'react-native';
import { Friend, firstName } from '../people';
import { Glass, Icon, Txt } from '../design';

/** The Wrapped entry for a demo friend (no chats to wrap yet): a glass row with a pink sparkle tile, shown disabled. */
export function WrappedEntry({ friend }: { friend: Friend }) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`Your Wrapped with ${firstName(friend)}, standout moments from your chats`}
    >
      <Glass tone="light" radius={24} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 16 }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 44, 171, 0.9)' }}>
          <Icon name="sparkles" size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="headline" shadow>
            Your Wrapped with {firstName(friend)}
          </Txt>
          <Txt variant="subhead" tone="secondary" shadow>
            Standout moments from your chats
          </Txt>
        </View>
        <Icon name="chevron.right" size={13} color="rgba(255, 255, 255, 0.7)" />
      </Glass>
    </View>
  );
}
