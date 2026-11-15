import { StyleSheet, Text, View } from 'react-native';
import { Milestone, milestoneDateLine, milestoneHeadline } from '../fixtures';
import { useNotes } from '../store';
import { Theme, Type } from '../theme';
import { Face, RowChevron, ServiceIcon, Symbol } from './Paper';

export function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const { items } = useNotes();
  const gift = items(milestone.friend, 'gifts')[0];
  const source = milestone.friend.messages.find((m) => m.id === milestone.sourceID);
  return (
    <View style={styles.row}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Face initials={milestone.friend.initials} />
        <View style={styles.badge}>
          <Symbol name={milestone.kind === 'birthday' ? 'birthday.cake.fill' : 'heart.fill'} size={11} color={Theme.celebrateTone.ink} weight="bold" />
        </View>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[Type.headline, { color: Theme.ink }]}>{milestoneHeadline(milestone)}</Text>
        <Text style={[Type.subheadline, { color: Theme.secondary }]}>{milestoneDateLine(milestone)}</Text>
        {milestone.kind === 'birthday' && gift ? (
          <View style={styles.inline}>
            <Symbol name="gift" size={14} color={Theme.coralTone.ink} weight="medium" />
            <Text style={[Type.subheadline, { color: Theme.coralTone.ink, fontWeight: '500' }]}>Gift idea: {gift.title}</Text>
          </View>
        ) : null}
        {milestone.kind === 'friendship' && source ? (
          <View style={styles.inline}>
            <ServiceIcon service={source.service} />
            <Text style={[Type.subheadline, { color: Theme.secondary }]}>First message</Text>
          </View>
        ) : null}
      </View>
      <RowChevron />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.celebrateTone.fill,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
