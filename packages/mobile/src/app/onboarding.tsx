import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { API_URL } from '../api/client';
import { ensureAccount, saveOnboarding, uploadExport } from '../api/upload';
import { useFirstRun } from '../firstRun';
import { Tactile } from '../design/Tactile';

/**
 * First-run onboarding in PostHog's design language (PostHog 3000 light theme: warm #f3f4ef canvas, white surfaces
 * with #dadbd2 hairlines, #111 text, #f54e01 accent, 6px corners, and 3D "Lemon" buttons whose face sits 3px up on a
 * darker frame and presses down). One question per screen with a progress bar and "N of M"; choices advance on tap. Six steps (seven for iMessage, which asks how to export first):
 * chat type, app, upload, your name, anything else, and where to send the report. Answers go to AsyncStorage.
 */
const BRAND = 'Textrovert';
const ANSWERS_KEY = 'textrovert.onboarding.v1';
const MAC_APP_URL = 'https://github.com/nelonmelons/textrovert/tree/main/mac';

// PostHog 3000 light theme (frontend/src/styles/base.scss, lib/lemon-ui/LemonButton/LemonButton.scss).
const D = {
  canvas: '#F3F4EF', // --color-bg-3000-light
  surface: '#FFFFFF', // --color-bg-surface-primary
  surfaceAlt: '#F3F4EF', // --secondary-3000-button-bg-light
  border: '#DADBD2', // --border-3000-light
  text: '#111111', // --text-3000-light
  muted: 'rgba(17, 17, 17, 0.6)', // --muted-3000-light
  placeholder: 'rgba(17, 17, 17, 0.4)',
  accent: '#F54E01', // --primary-3000-light
  accentSoft: 'rgba(245, 78, 1, 0.08)',
  primaryFace: '#EB9D2A', // --primary-3000-frame-bg-light
  primaryEdge: '#B17816', // --primary-3000-button-border-light
  secondaryEdge: '#CCCCCC', // --secondary-3000-button-border-light
  success: '#388600', // --success
  danger: '#DB3707', // --danger
  radius: 6, // --radius: 0.375rem
  depth: 3, // --lemon-button-chrome-depth: 0.1875rem
};
const SANS = Platform.select({ ios: undefined, android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' });
const text = (size: number, color: string, weight: TextStyle['fontWeight'] = '400'): TextStyle => ({ fontFamily: SANS, fontSize: size, lineHeight: Math.round(size * 1.35), color, fontWeight: weight });

type ChatType = 'romantic' | 'group' | 'friend' | 'family' | 'work' | 'other';
type ChatApp = 'whatsapp' | 'imessage' | 'instagram' | 'messenger' | 'kakaotalk' | 'line';
type Method = 'mac' | 'iphone';
type StepId = 'type' | 'app' | 'method' | 'upload' | 'self' | 'extra' | 'email';
type PickedFile = { name: string; size?: number; uri: string; mimeType?: string };

const CHAT_TYPES: { id: ChatType; emoji: string; title: string; subtitle: string }[] = [
  { id: 'romantic', emoji: '💌', title: 'Romantic', subtitle: 'Partner, situationship, ex...' },
  { id: 'group', emoji: '😂', title: 'Friends group', subtitle: 'Uni crew, trip chat, sports team...' },
  { id: 'friend', emoji: '🫶', title: 'Any friend', subtitle: 'Best friend, childhood friend, work bestie...' },
  { id: 'family', emoji: '🏠', title: 'Family', subtitle: 'Family group, mum or dad, siblings...' },
  { id: 'work', emoji: '📋', title: 'Work / team', subtitle: 'Team chat, colleagues, boss...' },
  { id: 'other', emoji: '🤷‍♂️', title: 'Other', subtitle: 'Roommates, neighbours, anything else...' },
];

const APPS: { id: ChatApp; name: string; emoji: string }[] = [
  { id: 'whatsapp', name: 'WhatsApp', emoji: '📞' },
  { id: 'imessage', name: 'iMessage', emoji: '💬' },
  { id: 'instagram', name: 'Instagram', emoji: '📸' },
  { id: 'messenger', name: 'Messenger', emoji: '⚡️' },
  { id: 'kakaotalk', name: 'KakaoTalk', emoji: '💛' },
  { id: 'line', name: 'LINE', emoji: '💚' },
];

const fileSize = (bytes?: number) =>
  bytes === undefined ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const firstRun = useFirstRun();

  const [chatType, setChatType] = useState<ChatType>();
  const [app, setApp] = useState<ChatApp>();
  const [method, setMethod] = useState<Method>();
  const [file, setFile] = useState<PickedFile>();
  const [pickError, setPickError] = useState<string>();
  const [selfName, setSelfName] = useState('');
  const [extra, setExtra] = useState('');
  const [email, setEmail] = useState('');
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  // Kept across retries so a failed save of the answers doesn't upload the file twice.
  const uploadedId = useRef<string | undefined>(undefined);

  const steps: StepId[] = ['type', 'app', ...(app === 'imessage' ? (['method'] as const) : []), 'upload', 'self', 'extra', 'email'];
  const step = steps[Math.min(index, steps.length - 1)];
  const appName = APPS.find((a) => a.id === app)?.name ?? 'chat';

  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  // Let the card's press play before the screen changes.
  const chooseThen = (apply: () => void) => {
    apply();
    setTimeout(next, 160);
  };

  const pick = async () => {
    setPickError(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      setFile({ name: asset.name, size: asset.size ?? undefined, uri: asset.uri, mimeType: asset.mimeType ?? undefined });
    } catch {
      setPickError("Couldn't open that file. Try again?");
    }
  };

  const finish = async (skipped = false, upload = true) => {
    if (finishing) return;
    setFinishing(true);
    setUploadError(undefined);
    const answers = { chatType, app, method, file: file ? { name: file.name, size: file.size } : null, selfName, extra, email, skipped, at: Date.now() };
    try {
      await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    } catch {
      // Keeping the answers is a nice-to-have; never block the app on it.
    }
    let uploadId = uploadedId.current;
    if (API_URL) {
      try {
        await ensureAccount();
        if (!uploadId && !skipped && upload && file) {
          uploadId = await uploadExport(file, selfName);
          uploadedId.current = uploadId;
        }
        await saveOnboarding({
          chatType,
          app,
          method,
          selfName,
          notes: extra,
          email,
          uploadId,
          fileName: file?.name,
          skippedUpload: !uploadId,
        });
      } catch (e) {
        if (!skipped) {
          setUploadError(e instanceof Error ? e.message : "Couldn't save your answers. Try again?");
          setFinishing(false);
          return;
        }
      }
    }
    await firstRun.finish({ messagesExport: file ? { name: file.name, size: file.size } : undefined, contactsOptIn: false });
    if (uploadId) router.replace({ pathname: '/indexing', params: { uploadId } });
    else router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: D.canvas }}>
      <StatusBar style="dark" />
      <Header index={index} total={steps.length} onBack={index === 0 ? undefined : back} onClose={index === 0 ? () => finish(true) : undefined} topInset={insets.top} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          key={step}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: insets.bottom + 48 }}
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInRight.duration(280)} style={{ gap: 14 }}>
            {step === 'type' && (
              <>
                <Question>What type of chat would you like {BRAND} to analyze?</Question>
                {CHAT_TYPES.map((t) => (
                  <ChoiceCard key={t.id} selected={chatType === t.id} onPress={() => chooseThen(() => setChatType(t.id))} label={t.title}>
                    <Emoji>{t.emoji}</Emoji>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={text(16, D.text, '600')}>{t.title}</Text>
                      <Text style={text(14, D.muted)}>{t.subtitle}</Text>
                    </View>
                  </ChoiceCard>
                ))}
              </>
            )}

            {step === 'app' && (
              <>
                <Question>Where's your chat from?</Question>
                {APPS.map((a) => (
                  <ChoiceCard
                    key={a.id}
                    selected={app === a.id}
                    onPress={() =>
                      chooseThen(() => {
                        setApp(a.id);
                        if (a.id !== 'imessage') setMethod(undefined);
                      })
                    }
                    label={a.name}>
                    <Emoji tile>{a.emoji}</Emoji>
                    <Text style={[text(16, D.text, '600'), { flex: 1 }]}>{a.name}</Text>
                  </ChoiceCard>
                ))}
              </>
            )}

            {step === 'method' && (
              <>
                <Question>How do you want to export your iMessage chat?</Question>
                <MethodCard
                  emoji="💻"
                  title="On your Mac"
                  badge="Recommended"
                  lead="With our Mac app"
                  points={[
                    { ok: true, text: 'Every message, best accuracy' },
                    { ok: true, text: 'Export years of texts in 1 click' },
                    { ok: false, text: 'Needs macOS 14 or newer' },
                  ]}
                  selected={method === 'mac'}
                  onPress={() => chooseThen(() => setMethod('mac'))}
                />
                <MethodCard
                  emoji="📱"
                  title="On your iPhone"
                  lead="By screen recording the chat"
                  points={[
                    { ok: true, text: 'No Mac needed' },
                    { ok: false, text: 'Slow and less accurate for long chats' },
                    { ok: false, text: "Doesn't work with group chats" },
                  ]}
                  selected={method === 'iphone'}
                  onPress={() => chooseThen(() => setMethod('iphone'))}
                />
              </>
            )}

            {step === 'upload' && (
              <>
                {app === 'imessage' && method !== 'iphone' ? (
                  <>
                    <Question>Download our iMessage export app</Question>
                    <View style={{ backgroundColor: D.surface, borderRadius: D.radius, borderWidth: 1, borderColor: D.border, padding: 14, gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Emoji tile>💻</Emoji>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={text(16, D.text, '600')}>Export Assistant</Text>
                          <Text style={text(13, D.muted)}>Requires macOS 14 or newer.</Text>
                        </View>
                      </View>
                      <SecondaryButton title="Download for macOS" onPress={() => Linking.openURL(MAC_APP_URL)} />
                      <Text style={text(14, D.muted)}>Then follow its steps to save your iMessage conversations as a .textrovert file, and AirDrop it to this phone.</Text>
                    </View>
                    <Text style={[text(18, D.text, '600'), { marginTop: 10 }]}>Then upload your iMessage chat</Text>
                  </>
                ) : (
                  <Question>{app === 'imessage' ? 'Upload your iMessage screen recording' : `Upload your ${appName} chat`}</Question>
                )}
                {app === 'imessage' && method === 'iphone' ? <Text style={text(15, D.muted)}>Choose the screen recording from your Gallery or Files app.</Text> : null}
                <UploadBox file={file} onPress={pick} format={app === 'imessage' ? (method === 'iphone' ? 'MOV' : 'TEXTROVERT') : app === 'whatsapp' ? 'ZIP · TXT' : 'ZIP'} />
                {pickError ? <Text style={text(13, D.danger)}>{pickError}</Text> : null}
                <Text style={[text(13, D.muted), { textAlign: 'center' }]}>🔒 Your data stays private</Text>
                <PrimaryButton title="Continue" onPress={next} disabled={!file} />
                <TextLink onPress={next}>I'll do this later</TextLink>
              </>
            )}

            {step === 'self' && (
              <>
                <Question subtitle={`${BRAND} will call you by this name in your report.`}>What's your name?</Question>
                <Field value={selfName} onChangeText={setSelfName} placeholder="John" onSubmit={() => selfName.trim() && next()} />
                <PrimaryButton title="Continue" onPress={next} disabled={!selfName.trim()} />
              </>
            )}

            {step === 'extra' && (
              <>
                <Question>Anything else {BRAND} should know?</Question>
                <Field value={extra} onChangeText={setExtra} placeholder="What happened off the chat, what you want looked at…" multiline />
                {extra.trim() ? <PrimaryButton title="Continue" onPress={next} /> : <SecondaryButton title="Skip" onPress={next} />}
              </>
            )}

            {step === 'email' && (
              <>
                <Question>Which email address should we send your report to?</Question>
                <Text style={text(13, D.muted, '600')}>Email address</Text>
                <Field value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" onSubmit={() => finish()} />
                <PrimaryButton title={finishing ? (file && API_URL ? 'Uploading…' : 'Creating…') : 'Create my report'} onPress={() => finish()} disabled={finishing} />
                {uploadError ? (
                  <>
                    <Text style={text(13, D.danger)}>{uploadError}</Text>
                    <TextLink onPress={() => finish(false, false)}>Continue without uploading</TextLink>
                  </>
                ) : null}
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Back (or close on the first step), PostHog's thin accent progress bar, and "N of M". */
function Header({ index, total, onBack, onClose, topInset }: { index: number; total: number; onBack?: () => void; onClose?: () => void; topInset: number }) {
  return (
    <View style={{ paddingTop: topInset + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.canvas }}>
      <Pressable accessibilityRole="button" accessibilityLabel={onBack ? 'Back' : 'Close'} onPress={onBack ?? onClose} hitSlop={12} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={text(20, D.muted, '500')}>{onBack ? '←' : '✕'}</Text>
      </Pressable>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: D.border, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(((index + 1) / total) * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: D.accent }} />
      </View>
      <Text style={[text(12, D.muted, '600'), { minWidth: 40, textAlign: 'right' }]}>
        {index + 1} of {total}
      </Text>
    </View>
  );
}

function Question({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      <Text accessibilityRole="header" style={[text(24, D.text, '700'), { letterSpacing: -0.3 }]}>
        {children}
      </Text>
      {subtitle ? <Text style={text(15, D.muted)}>{subtitle}</Text> : null}
    </View>
  );
}

function Emoji({ children }: { children: string; tile?: boolean }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: D.radius, backgroundColor: D.canvas, borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, lineHeight: 26 }}>{children}</Text>
    </View>
  );
}

/** A tap-to-advance answer: PostHog's secondary 3D button, edged in the accent when chosen. */
function ChoiceCard({ children, onPress, selected, label }: { children: ReactNode; onPress: () => void; selected?: boolean; label: string }) {
  return (
    <Tactile
      face={selected ? '#FFF4EE' : D.surface}
      edge={selected ? D.accent : D.secondaryEdge}
      radius={D.radius}
      lip={D.depth}
      ring={1}
      onPress={onPress}
      accessibilityLabel={label}
      faceStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 }}>
      {children}
    </Tactile>
  );
}

function MethodCard({ emoji, title, badge, lead, points, selected, onPress }: { emoji: string; title: string; badge?: string; lead: string; points: { ok: boolean; text: string }[]; selected?: boolean; onPress: () => void }) {
  return (
    <Tactile
      face={selected ? '#FFF4EE' : D.surface}
      edge={selected ? D.accent : D.secondaryEdge}
      radius={D.radius}
      lip={D.depth}
      ring={1}
      onPress={onPress}
      accessibilityLabel={title}
      faceStyle={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Emoji>{emoji}</Emoji>
        <Text style={text(16, D.text, '600')}>{title}</Text>
        {badge ? (
          <View style={{ backgroundColor: '#FFF4EE', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(245, 78, 1, 0.35)', paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text style={text(11, D.accent, '700')}>{badge.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <Text style={text(14, D.muted)}>{lead}</Text>
      <View style={{ gap: 4 }}>
        {points.map((p) => (
          <View key={p.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text style={[text(14, p.ok ? D.success : D.danger, '700'), { width: 14 }]}>{p.ok ? '✓' : '×'}</Text>
            <Text style={[text(14, D.text), { flex: 1 }]}>{p.text}</Text>
          </View>
        ))}
      </View>
    </Tactile>
  );
}

/** PostHog's primary LemonButton: amber face 3px up on its darker frame, pressing down on tap. */
function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Tactile
        face={D.primaryFace}
        edge={D.primaryEdge}
        radius={D.radius}
        lip={D.depth}
        ring={1}
        haptic="thud"
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={title}
        faceStyle={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={text(15, D.text, '600')}>{title}</Text>
      </Tactile>
    </View>
  );
}

/** PostHog's secondary LemonButton: white face on a grey frame. */
function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Tactile
      face={D.surface}
      edge={D.secondaryEdge}
      radius={D.radius}
      lip={D.depth}
      ring={1}
      onPress={onPress}
      accessibilityLabel={title}
      faceStyle={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={text(15, D.text, '600')}>{title}</Text>
    </Tactile>
  );
}

function UploadBox({ file, onPress, format }: { file?: PickedFile; onPress: () => void; format: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={file ? `Change file, ${file.name}` : 'Tap to upload'} onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: file ? D.accent : D.secondaryEdge,
            backgroundColor: file ? '#FFF4EE' : D.surface,
            borderRadius: D.radius,
            paddingVertical: 24,
            paddingHorizontal: 16,
            alignItems: 'center',
            gap: 4,
            opacity: pressed ? 0.7 : 1,
          }}>
          {file ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 24, lineHeight: 30 }}>📄</Text>
              <Text numberOfLines={1} style={text(15, D.text, '600')}>
                {file.name}
              </Text>
              <Text style={text(13, D.muted)}>{fileSize(file.size)} · Tap to change</Text>
            </Animated.View>
          ) : (
            <>
              <Text style={[text(11, D.muted, '700'), { letterSpacing: 0.6 }]}>{format}</Text>
              <Text style={text(15, D.accent, '600')}>Tap to upload</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

function Field({ value, onChangeText, placeholder, multiline, keyboardType, onSubmit }: { value: string; onChangeText: (v: string) => void; placeholder: string; multiline?: boolean; keyboardType?: 'default' | 'email-address'; onSubmit?: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={D.placeholder}
      autoFocus
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={keyboardType === 'email-address' ? 'none' : multiline ? 'sentences' : 'words'}
      autoCorrect={!keyboardType}
      returnKeyType={multiline ? 'default' : 'next'}
      onSubmitEditing={multiline ? undefined : onSubmit}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      selectionColor={D.accent}
      style={{
        minHeight: multiline ? 120 : 46,
        borderRadius: D.radius,
        borderWidth: 1,
        borderColor: focused ? D.accent : D.border,
        backgroundColor: D.surface,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 10 : 0,
        fontFamily: SANS,
        fontSize: 16,
        color: D.text,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

function TextLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
      <Text style={text(15, D.accent, '600')}>{children}</Text>
    </Pressable>
  );
}
