import { useState } from 'react';
import { Image, Platform, Pressable, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { friendById, NoteSection, sectionInfo } from '../people';
import { useNotes } from '../store';
import { DesignFonts, EmojiAvatar, geist, PillButton, radii, Screen, space, Txt, useDesign, withAlpha, type FillName } from '@/design';

const party = require('../../assets/art/hedgehog-party.png');

const sectionLook: Record<NoteSection, { emoji: string; color: FillName }> = {
  reply: { emoji: '💬', color: 'lilac' },
  plans: { emoji: '🗓️', color: 'blue' },
  together: { emoji: '🎳', color: 'mint' },
  memories: { emoji: '📸', color: 'peach' },
  gifts: { emoji: '🎁', color: 'pink' },
};

export default function NoteEditor() {
  const params = useLocalSearchParams<{ friend: string; section: NoteSection; id?: string }>();
  const friend = friendById(params.friend);
  const { c } = useDesign();
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
  const look = sectionLook[params.section];
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
    <DesignFonts>
      <Stack.Screen
        options={{
          headerTitle: existing ? `Edit ${info.noun}` : `Add to ${info.title}`,
          headerStyle: { backgroundColor: c.background },
          headerTitleStyle: { color: c.text, fontFamily: geist['600'] },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Txt variant="body" tone="accent">
                {status === 'saved' && !changed ? 'Done' : 'Cancel'}
              </Txt>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} disabled={!canSave} hitSlop={10}>
              <Txt variant="body" tone={canSave ? 'accent' : 'tertiary'} style={{ fontWeight: '600' }}>
                Save
              </Txt>
            </Pressable>
          ),
        }}
      />
      <Screen contentStyle={{ paddingTop: space.lg, gap: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <EmojiAvatar emoji={look.emoji} color={look.color} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title2">{info.title}</Txt>
            <Txt variant="subhead" tone="secondary">
              {source ? `From ${source.service} · ${source.date}` : `With ${friend.name}`}
            </Txt>
          </View>
        </View>
        <Field label="What" value={title} onChange={setTitle} placeholder={info.prompt} />
        <Field label="Details" value={detail} onChange={setDetail} placeholder="Optional" multiline />
        {status === 'failed' ? (
          <View style={{ gap: space.md, padding: space.lg, borderRadius: radii.lg, alignItems: 'flex-start', backgroundColor: withAlpha(c.danger, 0.1) }}>
            <Txt variant="subhead" color={c.danger} style={{ fontWeight: '600' }}>
              ⚠️ Couldn’t save. Your text is still here.
            </Txt>
            <PillButton title="Try again" emoji="🔁" small onPress={onSave} />
          </View>
        ) : changed ? (
          <Txt variant="subhead" tone="secondary">
            ✏️ Draft · not saved yet
          </Txt>
        ) : status === 'saved' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Image source={party} style={{ height: 72, width: 72 }} resizeMode="contain" />
            <Txt variant="headline" color={c.success}>
              Saved ✅
            </Txt>
          </View>
        ) : null}
      </Screen>
    </DesignFonts>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean }) {
  const { c } = useDesign();
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="subhead" style={{ fontWeight: '600' }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          { paddingHorizontal: space.lg, paddingVertical: 14, borderRadius: radii.lg, backgroundColor: c.fill, color: c.text, fontFamily: geist['400'], fontSize: 17 },
          multiline && { minHeight: 96, textAlignVertical: 'top' },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
    </View>
  );
}
