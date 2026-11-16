import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { FadeIn } from '@/components/FadeIn';
import { PaperScreen } from '@/components/PaperScreen';
import { radius, shadow, type, useTheme, type Tone } from '@/theme';

/** Placeholder for a tab whose screen is still being ported: a paper card with hedgehog art and a way to Ask. */
export function ComingSoon({ title, blurb, tone, art, teasers = [] }: { title: string; blurb: string; tone?: Tone; art: ImageSourcePropType; teasers?: string[] }) {
  const theme = useTheme();
  const t = tone ?? theme.tones.accent;
  return (
    <PaperScreen title={title}>
      <View style={styles.center}>
        <FadeIn>
          <View style={[styles.card, shadow.soft, { backgroundColor: theme.panel, borderColor: theme.gridMajor }]}>
            <View style={[styles.artWrap, { backgroundColor: t.fill }]}>
              <Image source={art} resizeMode="contain" style={styles.art} aria-hidden />
            </View>
            <View style={[styles.badge, { backgroundColor: t.fill }]}>
              <Text style={[type.caption, styles.badgeText, { color: t.ink }]}>COMING SOON</Text>
            </View>
            <Text accessibilityRole="header" style={[type.title2, { color: theme.ink }]}>
              {title}
            </Text>
            <Text style={[type.subheadline, styles.blurb, { color: theme.secondary }]}>{blurb}</Text>
            {teasers.length > 0 ? (
              <View style={styles.teasers}>
                {teasers.map((s) => (
                  <View key={s} style={styles.teaser}>
                    <View style={[styles.dot, { backgroundColor: t.ink }]} />
                    <Text style={[type.footnote, { color: theme.ink }]}>{s}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={({ pressed }) => [styles.button, { backgroundColor: theme.ask.ink, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={[type.subheadline, { color: theme.panel, fontWeight: '700' }]}>Ask about your friends instead</Text>
            </Pressable>
          </View>
        </FadeIn>
      </View>
    </PaperScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { alignItems: 'center', gap: 10, padding: 24, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  artWrap: { width: 148, height: 148, borderRadius: 74, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  art: { width: 124, height: 104 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.capsule },
  badgeText: { fontWeight: '800', letterSpacing: 0.8 },
  blurb: { textAlign: 'center' },
  teasers: { alignSelf: 'stretch', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  button: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.capsule },
});
