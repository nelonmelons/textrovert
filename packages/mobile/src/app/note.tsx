import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolViewProps } from 'expo-symbols';
import { friendById, NoteSection, sectionInfo } from '../fixtures';
import { useNotes } from '../store';
import { sectionTone, Theme, Type, withAlpha } from '../theme';
import { art, ServiceIcon, Symbol, ToneTab } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';

export default function NoteEditor() {
  const params = useLocalSearchParams<{ friend: string; section: NoteSection; id?: string }>();
  const friend = friendById(params.friend);
  const { items, save } = useNotes();
  const existing = friend ? items(friend, params.section).find((n) => n.id === params.id) : undefined;
  const [noteID] = useState(existing?.id ?? `note-${Date.now()}`);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [detail, setDetail] = useState(existing?.detail ?? '');
  const [savedTitle, setSavedTitle] = useState(existing?.title ?? '');
  const [savedDetail, setSavedDetail] = useState(existing?.detail ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  if (!friend) return null;

  const info = sectionInfo[params.section];
  const tone = sectionTone(params.section);
  const source = friend.messages.find((m) => m.id === existing?.sourceID);
  const changed = title !== savedTitle || detail !== savedDetail;
  const canSave = title.trim().length > 0 && (changed || status === 'failed');

  const onSave = async () => {
    if (!title.trim()) return;
    try {
      await save(friend, { ...(existing ?? { section: params.section }), id: noteID, section: params.section, title: title.trim(), detail: detail.trim() });
      setSavedTitle(title);
      setSavedDetail(detail);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: existing ? `Edit ${info.noun}` : `Add to ${info.title}`,
          headerTitleStyle: { color: Theme.ink, fontWeight: '600' },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[Type.body, { color: Theme.accent }]}>{status === 'saved' && !changed ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} disabled={!canSave} hitSlop={10}>
              <Text style={[Type.body, { color: canSave ? Theme.accent : Theme.secondary, fontWeight: '600' }]}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
        <ToneTab title={info.title} symbol={info.symbol as SymbolViewProps['name']} tone={tone} />
        {source ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ServiceIcon service={source.service} />
            <Text style={[Type.caption, { color: Theme.secondary }]}>{source.date}</Text>
          </View>
        ) : null}
        <Field label="What" value={title} onChange={setTitle} placeholder={info.prompt} />
        <Field label="Details" value={detail} onChange={setDetail} placeholder="Optional" multiline />
        {status === 'failed' ? (
          <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: withAlpha(Theme.deadline, 0.1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Symbol name="exclamationmark.triangle.fill" size={14} color={Theme.deadline} weight="semibold" />
              <Text style={[Type.subheadline, { color: Theme.deadline, fontWeight: '600' }]}>Couldn’t save. Your text is still here.</Text>
            </View>
            <Pressable onPress={onSave} style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 14, minHeight: 36, borderRadius: 18, backgroundColor: Theme.accent }}>
              <Symbol name="arrow.clockwise" size={13} color="#FFFFFF" weight="semibold" />
              <Text style={[Type.subheadline, { color: '#FFFFFF', fontWeight: '600' }]}>Try again</Text>
            </Pressable>
          </View>
        ) : changed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Symbol name="pencil.line" size={13} color={Theme.secondary} />
            <Text style={[Type.subheadline, { color: Theme.secondary }]}>Draft · not saved yet</Text>
          </View>
        ) : status === 'saved' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={art.dance} style={{ height: 64, width: 64 }} resizeMode="contain" />
            <Symbol name="checkmark.circle.fill" size={14} color={Theme.activitiesTone.ink} weight="semibold" />
            <Text style={[Type.subheadline, { color: Theme.activitiesTone.ink, fontWeight: '600', marginLeft: -6 }]}>Saved</Text>
          </View>
        ) : null}
      </PaperScroll>
    </>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '600' }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Theme.secondary}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          Type.body,
          { padding: 12, color: Theme.ink, backgroundColor: Theme.background, borderRadius: 12, borderWidth: 1, borderColor: withAlpha(Theme.accent, 0.35) },
          multiline && { minHeight: 64, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}
