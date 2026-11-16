import { useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, BUILT_IN } from '../api/client';
import { useDataMode } from '../api/mode';
import { useFirstRun } from '../firstRun';
import { Rounded, Theme, Type } from '../theme';
import { GridPaper, Symbol } from '../components/Paper';

function signInError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 401) return 'That access key doesn’t match this server.';
  if (error.status === 404) return 'That address isn’t a Textrovert server.';
  if (error.status === 503) return 'That server isn’t set up to share chats yet.';
  return error.message;
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mode = useDataMode();
  const firstRun = useFirstRun();
  const [url, setUrl] = useState(mode.account?.url ?? BUILT_IN.url);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ready = url.trim().length > 0 && key.trim().length > 0 && !busy;

  const leave = () => {
    if (!firstRun.done) router.replace('/setup');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const signIn = async () => {
    if (!ready) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(undefined);
    try {
      await mode.signIn(url, key);
      leave();
    } catch (e) {
      setError(signInError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 28 + insets.bottom }]}>
        <GridPaper width={width} height={height * 2} />
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/art/hedgehog-mark.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.brandName}>textrovert</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={leave} hitSlop={12}>
            <Text style={[Type.subheadline, styles.secondary]}>Not now</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Your chats, on your phone</Text>
            <Text style={[Type.largeTitle, styles.title]}>Sign in</Text>
            <Text style={[Type.body, styles.secondary, { marginTop: 8 }]}>Connect this phone to your Textrovert server to see your own people, Ask and stats.</Text>
          </View>
          <Image source={require('../../assets/art/hedgehog-reader.png')} style={styles.reader} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={[Type.subheadline, styles.label]}>Server address</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="your-server.convex.site"
              placeholderTextColor={Theme.secondary}
              accessibilityLabel="Server address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
              returnKeyType="next"
              style={[Type.body, styles.input]}
            />
          </View>
          <View style={styles.field}>
            <Text style={[Type.subheadline, styles.label]}>Access key</Text>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="Paste your access key"
              placeholderTextColor={Theme.secondary}
              accessibilityLabel="Access key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="none"
              returnKeyType="go"
              onSubmitEditing={signIn}
              style={[Type.body, styles.input]}
            />
          </View>
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Symbol name="exclamationmark.circle.fill" size={13} color={Theme.deadline} weight="semibold" />
              <Text style={[Type.footnote, { flex: 1, fontWeight: '600', color: Theme.deadline }]}>{error}</Text>
            </View>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={signIn} style={({ pressed }) => [styles.button, !ready && styles.buttonDisabled, pressed && styles.buttonPressed]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[Type.headline, styles.buttonText]}>Sign in</Text>}
        </Pressable>

        <View style={styles.privacyNote}>
          <Symbol name="lock.shield" size={16} color={Theme.activitiesTone.ink} weight="semibold" />
          <Text style={[Type.footnote, styles.secondary, { flex: 1 }]}>Your key stays in this phone’s Keychain and is only sent to this server. Without signing in, the app shows sample friends.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.paper },
  content: { paddingHorizontal: 22, gap: 18 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mark: { width: 27, height: 27, tintColor: Theme.accent },
  brandName: { fontFamily: Rounded.heavy, color: Theme.accent, fontSize: 17 },
  hero: { flexDirection: 'row', alignItems: 'center', minHeight: 152, gap: 4 },
  heroCopy: { flex: 1 },
  eyebrow: { fontFamily: Rounded.bold, fontSize: 13, lineHeight: 18, color: Theme.accent, marginBottom: 6 },
  title: { fontFamily: Rounded.heavy, color: Theme.ink, fontSize: 31, lineHeight: 36 },
  reader: { width: 98, height: 128, marginRight: -4 },
  secondary: { color: Theme.secondary },
  card: { gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(60, 60, 67, 0.12)', backgroundColor: 'rgba(255,255,255,0.88)' },
  field: { gap: 6 },
  label: { color: Theme.ink, fontWeight: '600' },
  input: { paddingHorizontal: 12, paddingVertical: 11, color: Theme.ink, backgroundColor: Theme.background, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168, 78, 88, 0.35)' },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  button: { minHeight: 54, borderRadius: 18, backgroundColor: Theme.accent, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#FFFFFF', fontFamily: Rounded.bold },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2 },
});
