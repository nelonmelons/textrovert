import { Fragment, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { API_URL } from '../api/client';
import { ensureAccount, saveOnboarding, uploadExport } from '../api/upload';
import { useFirstRun } from '../firstRun';
import { Backdrop, BigButton, Chevron, Field, FieldError, FormCard, Glass, Icon, IconButton, PillButton, PressScale, Sticker, Txt, Wordmark } from '@/design';

/**
 * First-run onboarding, one question per screen, in Ditto's frontpage design: the painted sky behind, a thin white
 * progress bar with "N of M", each question as a white Spencer title, choices as rows in the FAQ's house glass (the
 * chosen one turns into the white pill), and typed answers in the Enroll card (a black/10 field over the white pill).
 * Six steps (seven for iMessage, which asks how to export first): chat type, app, upload, your name, anything else, and
 * where to send the report. Answers go to AsyncStorage.
 */
const BRAND = 'Textrovert';
const ANSWERS_KEY = 'textrovert.onboarding.v1';
const MAC_APP_URL = 'https://github.com/nelonmelons/textrovert/tree/main/mac';

type ChatType = 'romantic' | 'group' | 'friend' | 'family' | 'work' | 'other';
type ChatApp = 'whatsapp' | 'imessage' | 'instagram' | 'messenger' | 'kakaotalk' | 'line';
type Method = 'mac' | 'iphone';
type StepId = 'type' | 'app' | 'method' | 'upload' | 'self' | 'extra' | 'email';
type PickedFile = { name: string; size?: number; uri: string; mimeType?: string };

const CHAT_TYPES: { id: ChatType; title: string; subtitle: string }[] = [
  { id: 'romantic', title: 'Romantic', subtitle: 'Partner, situationship, ex...' },
  { id: 'group', title: 'Friends group', subtitle: 'Uni crew, trip chat, sports team...' },
  { id: 'friend', title: 'Any friend', subtitle: 'Best friend, childhood friend, work bestie...' },
  { id: 'family', title: 'Family', subtitle: 'Family group, mum or dad, siblings...' },
  { id: 'work', title: 'Work / team', subtitle: 'Team chat, colleagues, boss...' },
  { id: 'other', title: 'Other', subtitle: 'Roommates, neighbours, anything else...' },
];

const APPS: { id: ChatApp; name: string }[] = [
  { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'imessage', name: 'iMessage' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'messenger', name: 'Messenger' },
  { id: 'kakaotalk', name: 'KakaoTalk' },
  { id: 'line', name: 'LINE' },
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
  // Let the row's press show before the screen changes.
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
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Backdrop scene="clouds" scrim={0.12} />
      <Header index={index} total={steps.length} onBack={index === 0 ? undefined : back} onClose={index === 0 ? () => finish(true) : undefined} topInset={insets.top} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView key={step} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInRight.duration(300)} style={{ gap: 16 }}>
            {step === 'type' && (
              <>
                <Question>What type of chat would you like {BRAND} to analyze?</Question>
                <Choices>
                  {CHAT_TYPES.map((t) => (
                    <Choice key={t.id} title={t.title} subtitle={t.subtitle} selected={chatType === t.id} onPress={() => chooseThen(() => setChatType(t.id))} />
                  ))}
                </Choices>
              </>
            )}

            {step === 'app' && (
              <>
                <Question>Where's your chat from?</Question>
                <Choices>
                  {APPS.map((a) => (
                    <Choice
                      key={a.id}
                      title={a.name}
                      selected={app === a.id}
                      onPress={() =>
                        chooseThen(() => {
                          setApp(a.id);
                          if (a.id !== 'imessage') setMethod(undefined);
                        })
                      }
                    />
                  ))}
                </Choices>
              </>
            )}

            {step === 'method' && (
              <>
                <Question>How do you want to export your iMessage chat?</Question>
                <MethodCard
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
                    <Glass tone="dark" radius={24} style={{ padding: 16, gap: 12 }}>
                      <Txt variant="title2">Export Assistant</Txt>
                      <Txt variant="footnote" tone="secondary">
                        Requires macOS 14 or newer. Follow its steps to save your iMessage conversations as a .textrovert file, then AirDrop it to this phone.
                      </Txt>
                      <PillButton title="Download for macOS" onPress={() => Linking.openURL(MAC_APP_URL)} />
                    </Glass>
                    <Sticker text="Then upload your iMessage chat" accent="upload" size={20} style={{ marginTop: 8 }} />
                  </>
                ) : (
                  <Question>{app === 'imessage' ? 'Upload your iMessage screen recording' : `Upload your ${appName} chat`}</Question>
                )}
                {app === 'imessage' && method === 'iphone' ? (
                  <Txt variant="callout" tone="secondary" shadow>
                    Choose the screen recording from your Gallery or Files app.
                  </Txt>
                ) : null}
                {app === 'instagram' ? (
                  <Txt variant="callout" tone="secondary" shadow>
                    In Instagram, go to your profile → ☰ → Accounts Center → Your information and permissions → Export your information → Create export → Export to device. Tap Customize information and pick only Messages, set Date range to All time (JSON or HTML both work), then Start export. When Instagram emails you that it's ready, download the .zip and choose it here from the Files app.
                  </Txt>
                ) : null}
                <FormCard>
                  <PressScale onPress={pick} accessibilityLabel={file ? `Change file, ${file.name}` : 'Choose a file'} scale={0.98}>
                    <View style={{ minHeight: 76, borderRadius: 16, backgroundColor: 'rgba(0, 0, 0, 0.1)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 4 }}>
                      {file ? (
                        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 2 }}>
                          <Txt variant="body" numberOfLines={1} style={{ fontWeight: '700' }}>
                            {file.name}
                          </Txt>
                          <Txt variant="footnote" tone="secondary">
                            {fileSize(file.size)} · Tap to change
                          </Txt>
                        </Animated.View>
                      ) : (
                        <>
                          <Txt variant="caption" tone="tertiary" style={{ letterSpacing: 1 }}>
                            {app === 'imessage' ? (method === 'iphone' ? 'MOV' : 'TEXTROVERT') : app === 'whatsapp' ? 'ZIP · TXT' : 'ZIP'}
                          </Txt>
                          <Txt variant="body" tone="tertiary">
                            Tap to choose your file
                          </Txt>
                        </>
                      )}
                    </View>
                  </PressScale>
                  {pickError ? <FieldError>{pickError}</FieldError> : null}
                  <BigButton title="Continue" onPress={next} disabled={!file} />
                </FormCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="lock.shield" size={13} color="rgba(255, 255, 255, 0.8)" />
                  <Txt variant="footnote" tone="secondary" shadow>
                    Your data stays private
                  </Txt>
                </View>
                <TextLink onPress={next}>I'll do this later</TextLink>
              </>
            )}

            {step === 'self' && (
              <>
                <Question subtitle={`${BRAND} will call you by this name in your report.`}>What's your name?</Question>
                <FormCard>
                  <Field value={selfName} onChangeText={setSelfName} placeholder="John" autoFocus center autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => selfName.trim() && next()} />
                  <BigButton title="Continue" onPress={next} disabled={!selfName.trim()} />
                </FormCard>
              </>
            )}

            {step === 'extra' && (
              <>
                <Question>Anything else {BRAND} should know?</Question>
                <FormCard>
                  <Field value={extra} onChangeText={setExtra} placeholder="What happened off the chat, what you want looked at…" autoFocus multiline />
                  <BigButton title={extra.trim() ? 'Continue' : 'Skip'} kind={extra.trim() ? 'primary' : 'secondary'} onPress={next} />
                </FormCard>
              </>
            )}

            {step === 'email' && (
              <>
                <Question>Which email address should we send your report to?</Question>
                <FormCard>
                  <Field
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    autoFocus
                    center
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => finish()}
                  />
                  {uploadError ? <FieldError>{uploadError}</FieldError> : null}
                  <BigButton title={finishing ? (file && API_URL ? 'Uploading…' : 'Creating…') : 'Create my report'} onPress={() => finish()} disabled={finishing} />
                </FormCard>
                {uploadError ? <TextLink onPress={() => finish(false, false)}>Continue without uploading</TextLink> : null}
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The wordmark, back (or close on the first step), a thin white progress bar, and "N of M". */
function Header({ index, total, onBack, onClose, topInset }: { index: number; total: number; onBack?: () => void; onClose?: () => void; topInset: number }) {
  return (
    <View style={{ paddingTop: topInset + 12, paddingHorizontal: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={22} />
        <IconButton icon={onBack ? 'chevron.left' : 'xmark'} label={onBack ? 'Back' : 'Close'} size={40} onPress={onBack ?? onClose} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.25)', overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(((index + 1) / total) * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' }} />
        </View>
        <Txt variant="footnote" shadow style={{ fontWeight: '600', minWidth: 44, textAlign: 'right' }}>
          {index + 1} of {total}
        </Txt>
      </View>
    </View>
  );
}

function Question({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ gap: 8, marginBottom: 4, paddingHorizontal: 4 }}>
      <Txt accessibilityRole="header" variant="largeTitle">
        {children}
      </Txt>
      {subtitle ? (
        <Txt variant="callout" tone="secondary" shadow>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );
}

/** Choices as rows in the FAQ's house-glass card, divided by white/10 hairlines. */
function Choices({ children }: { children: ReactNode[] }) {
  return (
    <Glass tone="dark" radius={24} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
      {children.map((child, i) => (
        <Fragment key={i}>
          {i ? <View style={{ height: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginHorizontal: 12 }} /> : null}
          {child}
        </Fragment>
      ))}
    </Glass>
  );
}

/** A tap-to-advance answer: a row with a pink chevron; once chosen it becomes the white pill with navy ink. */
function Choice({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={title} scale={0.98}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: subtitle ? 12 : 15, borderRadius: 16, backgroundColor: selected ? '#FFFFFF' : 'transparent' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body" color={selected ? '#081721' : '#FFFFFF'} style={{ fontWeight: '700' }}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="footnote" color={selected ? 'rgba(8, 23, 33, 0.7)' : 'rgba(255, 255, 255, 0.8)'}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {selected ? <Icon name="checkmark" size={16} color="#081721" /> : <Chevron />}
      </View>
    </PressScale>
  );
}

function MethodCard({ title, badge, lead, points, selected, onPress }: { title: string; badge?: string; lead: string; points: { ok: boolean; text: string }[]; selected?: boolean; onPress: () => void }) {
  const ink = selected ? '#081721' : '#FFFFFF';
  const muted = selected ? 'rgba(8, 23, 33, 0.7)' : 'rgba(255, 255, 255, 0.8)';
  const body = (
    <View style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Txt variant="title2" color={ink} style={selected ? { textShadowRadius: 0, textShadowColor: 'transparent' } : undefined}>
          {title}
        </Txt>
        {badge ? <Sticker text={badge} accent={badge} size={14} /> : null}
      </View>
      <Txt variant="footnote" color={muted}>
        {lead}
      </Txt>
      <View style={{ gap: 4 }}>
        {points.map((p) => (
          <View key={p.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name={p.ok ? 'checkmark' : 'xmark'} size={12} color={p.ok ? ink : muted} />
            <Txt variant="subhead" color={p.ok ? ink : muted} style={{ flex: 1 }}>
              {p.text}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
  return (
    <PressScale onPress={onPress} accessibilityLabel={title} scale={0.98}>
      {selected ? (
        <View style={{ borderRadius: 24, backgroundColor: '#FFFFFF' }}>{body}</View>
      ) : (
        <Glass tone="dark" radius={24}>
          {body}
        </Glass>
      )}
    </PressScale>
  );
}

/** The frontpage's small underlined link ("Ditto ghosting? Fix it"). */
function TextLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
      <Txt variant="callout" shadow style={{ textDecorationLine: 'underline' }}>
        {children}
      </Txt>
    </Pressable>
  );
}
