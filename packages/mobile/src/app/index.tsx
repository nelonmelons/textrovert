import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolViewProps } from 'expo-symbols';
import { Rounded, Theme, Type } from '../theme';
import { Friend, firstName, friends, Milestone, milestoneDateLine, milestoneHeadline, notes, upcomingMilestones } from '../fixtures';
import { art, DeadlineBadge, Divider, Face, GridPaper, HedgehogMark, RowChevron, SectionCard, Symbol, ToneTab } from '../components/Paper';

const serviceSymbol = (service: string): SymbolViewProps['name'] => (service === 'Instagram' ? 'camera' : service === 'WhatsApp' ? 'phone.bubble' : 'message');

function Row({ friend, children }: { friend: Friend; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Face initials={friend.initials} />
      <Pressable style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}>
        <View style={{ flex: 1, gap: 6 }}>{children}</View>
        <RowChevron />
      </Pressable>
    </View>
  );
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const gift = notes(milestone.friend, 'gifts')[0];
  const source = milestone.friend.messages.find((m) => m.id === milestone.sourceID);
  return (
    <Pressable style={({ pressed }) => [styles.milestone, pressed && styles.pressed]}>
      <View style={styles.milestoneFace}>
        <Face initials={milestone.friend.initials} />
        <View style={styles.milestoneBadge}>
          <Symbol name={milestone.kind === 'birthday' ? 'birthday.cake.fill' : 'heart.fill'} size={11} color={Theme.celebrateTone.ink} weight="bold" />
        </View>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[Type.headline, styles.ink]}>{milestoneHeadline(milestone)}</Text>
        <Text style={[Type.subheadline, styles.secondary]}>{milestoneDateLine(milestone)}</Text>
        {milestone.kind === 'birthday' && gift ? (
          <View style={styles.inline}>
            <Symbol name="gift" size={14} color={Theme.coralTone.ink} weight="medium" />
            <Text style={[Type.subheadline, { color: Theme.coralTone.ink, fontWeight: '500' }]}>Gift idea: {gift.title}</Text>
          </View>
        ) : null}
        {milestone.kind === 'friendship' && source ? (
          <View style={styles.inline}>
            <Symbol name={serviceSymbol(source.service)} size={12} color={Theme.secondary} weight="semibold" />
            <Text style={[Type.subheadline, styles.secondary]}>First message</Text>
          </View>
        ) : null}
      </View>
      <RowChevron />
    </Pressable>
  );
}

function Chip({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Text style={[Type.subheadline, { color: Theme.accentTone.ink, fontWeight: '500' }]}>{text}</Text>
    </Pressable>
  );
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [panelHeight, setPanelHeight] = useState(140);
  const [contentSize, setContentSize] = useState({ width: 440, height: 1200 });
  const milestones = upcomingMilestones();
  const sarah = friends[1];
  const mia = friends[0];

  return (
    <View style={{ flex: 1, backgroundColor: Theme.paper }}>
      <ScrollView
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: panelHeight + 40 }}
        onContentSizeChange={(width, height) => setContentSize({ width, height })}
      >
        <GridPaper width={contentSize.width} height={contentSize.height + 800} />
        <View style={{ gap: 24 }}>
          <View style={styles.header}>
            <View style={styles.inlineWide}>
              <HedgehogMark height={30} />
              <Text style={[Type.title2, { fontFamily: Rounded.heavy, color: Theme.accent }]}>textrovert</Text>
            </View>
            <Pressable accessibilityLabel="Emma, Settings">
              <Face initials="ED" />
            </Pressable>
          </View>

          <View style={{ gap: 22 }}>
            <Text style={[Type.largeTitle, { fontFamily: Rounded.bold, color: Theme.ink }]}>Today</Text>

            <SectionCard tone={Theme.repliesTone}>
              <View style={{ gap: 14 }}>
                <ToneTab title="Waiting on your reply" symbol="arrowshape.turn.up.left.fill" tone={Theme.repliesTone} />
                {friends.flatMap((friend) =>
                  notes(friend, 'reply').map((item) => (
                    <Row key={friend.id + item.id} friend={friend}>
                      <Text style={[Type.headline, styles.ink]}>
                        {item.title} with {firstName(friend)}
                      </Text>
                      {item.detail ? <Text style={[Type.subheadline, styles.secondary]}>{item.detail}</Text> : null}
                      {item.deadline ? <DeadlineBadge deadline={item.deadline} /> : null}
                    </Row>
                  )),
                )}
              </View>
            </SectionCard>

            {milestones.length > 0 ? (
              <SectionCard tone={Theme.celebrateTone} fillOpacity={0.55}>
                <View style={{ gap: 14 }}>
                  <View style={[styles.header, { alignItems: 'flex-start' }]}>
                    <ToneTab title="Coming up" symbol="sparkles" tone={Theme.celebrateTone} />
                    <Image source={art.toast} style={{ height: 44, width: 88 }} resizeMode="contain" />
                  </View>
                  {milestones.map((milestone, index) => (
                    <View key={milestone.id} style={{ gap: 14 }}>
                      {index > 0 ? <Divider /> : null}
                      <MilestoneRow milestone={milestone} />
                    </View>
                  ))}
                </View>
              </SectionCard>
            ) : null}

            <SectionCard tone={Theme.plansTone}>
              <View style={{ gap: 14 }}>
                <ToneTab title="Upcoming plans" symbol="calendar" tone={Theme.plansTone} />
                <Row friend={mia}>
                  <Text style={[Type.headline, styles.ink]}>Shopping with Mia · Thursday, 4 PM</Text>
                  <Text style={[Type.subheadline, styles.secondary, { marginTop: -2 }]}>Bookstore</Text>
                </Row>
                <Divider />
                <Row friend={sarah}>
                  <Text style={[Type.headline, styles.ink]}>Brunch with Sarah · Friday, 11 AM</Text>
                  <Text style={[Type.subheadline, styles.secondary, { marginTop: -2 }]}>Juniper · Not confirmed yet</Text>
                </Row>
              </View>
            </SectionCard>
          </View>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: Theme.paper }} />

      <View style={[styles.panel, { paddingBottom: insets.bottom + 6 }]} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
        <View style={styles.inlineWide}>
          <View
            style={[
              styles.field,
              focused && { backgroundColor: Theme.accentTone.fill, borderWidth: 3, shadowColor: Theme.accent, shadowOpacity: 0.35, shadowRadius: 12 },
            ]}
          >
            <View style={[styles.searchIcon, focused && { backgroundColor: Theme.accent }]}>
              <Symbol name="magnifyingglass" size={16} color={focused ? '#FFFFFF' : Theme.accent} weight="bold" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search or ask me anything"
              placeholderTextColor={Theme.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[Type.body, { flex: 1, color: Theme.ink }]}
            />
          </View>
        </View>
        {query.length === 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Text style={[Type.subheadline, styles.secondary]}>Try</Text>
            {['Mia', 'need +1 for VB tomorrow', '@sarahp', 'who’s waiting on me?'].map((text) => (
              <Chip key={text} text={text} onPress={() => setQuery(text)} />
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ink: { color: Theme.ink },
  secondary: { color: Theme.secondary },
  pressed: { backgroundColor: 'rgba(244, 227, 226, 0.6)', opacity: 0.75, borderRadius: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineWide: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  milestoneFace: { alignSelf: 'flex-start' },
  milestoneBadge: {
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
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: Theme.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: Theme.accent,
    backgroundColor: Theme.background,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  searchIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: Theme.accentTone.fill },
});
