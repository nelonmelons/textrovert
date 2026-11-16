import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { friendById, NoteSection, sectionInfo } from '../people';
import { useNotes } from '../store';
import { DesignFonts, EmojiAvatar, Eyebrow, fonts, Glass, Icon, PillButton, radii, Screen, space, sym, TopBar, Txt, useDesign, type FillName } from '@/design';

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
  const insets = useSafeAreaInsets();
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

  const bar = (
    <TopBar
      title={existing ? `Edit ${info.noun}` : `Add to ${info.title}`}
      leading={<PillButton title={status === 'saved' && !changed ? 'Done' : 'Cancel'} small onPress={() => router.back()} />}
      trailing={<PillButton title="Save" kind="primary" small disabled={!canSave} onPress={onSave} />}
    />
  );

  return (
    <DesignFonts>
      <Screen scene="sky" scrim={0.12} contentStyle={{ paddingTop: insets.top + 84, gap: space.xl }} overlay={bar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <EmojiAvatar emoji={look.emoji} color={look.color} size={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Eyebrow text={source ? `From ${source.service} · ${source.date}` : `With ${friend.name}`} />
            <Txt variant="title1">{info.title}</Txt>
          </View>
        </View>
        <Field label="What" value={title} onChange={setTitle} placeholder={info.prompt} />
        <Field label="Details" value={detail} onChange={setDetail} placeholder="Optional" multiline />
        {status === 'failed' ? (
          <Glass tone="dark" radius={radii.xl} style={{ gap: space.md, padding: space.lg, alignItems: 'flex-start' }}>
            <Txt variant="subhead" color={c.danger} style={{ fontWeight: '700' }}>
              Couldn’t save. Your text is still here.
            </Txt>
            <PillButton title="Try again" icon={<Icon name={sym('arrow.clockwise', 'refresh')} size={14} />} small onPress={onSave} />
          </Glass>
        ) : changed ? (
          <Txt variant="subhead" tone="secondary" shadow>
            Draft · not saved yet
          </Txt>
        ) : status === 'saved' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 0px 18px rgba(255, 44, 171, 0.55)' }}>
              <Icon name={sym('checkmark', 'check')} size={18} weight="bold" />
            </View>
            <Txt variant="headline" shadow>
              Saved
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
      <View style={{ paddingHorizontal: space.xs }}>
        <Eyebrow text={label} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.placeholder}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          { paddingHorizontal: space.lg, paddingVertical: 14, borderRadius: radii.lg, backgroundColor: c.input, borderWidth: 0.5, borderColor: c.edge, color: c.text, fontFamily: fonts.ui, fontSize: 16 },
          multiline && { minHeight: 96, textAlignVertical: 'top' },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
    </View>
  );
}
