import { View } from 'react-native';
import { Friend, firstName } from '../people';
import { Chevron, Glass, Icon, Txt } from '../design';

/** The Wrapped entry for a demo friend (no chats to wrap yet): a house-glass row, shown disabled. */
export function WrappedEntry({ friend }: { friend: Friend }) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`Your Wrapped with ${firstName(friend)}, standout moments from your chats`}
    >
      <Glass tone="dark" radius={24} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, opacity: 0.7 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title2">Your Wrapped with {firstName(friend)}</Txt>
          <Txt variant="footnote" tone="secondary">
            Standout moments from your chats
          </Txt>
        </View>
        <Chevron />
      </Glass>
    </View>
  );
}
