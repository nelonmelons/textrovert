import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { API_URL, ApiError } from '../../api/client';
import {
  createInvite,
  fetchMatch,
  fetchSelfName,
  isSettled,
  joinInvite,
  linkedMatchId,
  linkedMatchIds,
  linkMatch,
  listMatches,
  removeMatch,
  rerunMatch,
  sideLabel,
  unlinkMatch,
  type Match,
  type MatchSummary,
  type SharedItem,
} from '../../api/match';
import { loadOwnerKey } from '../../api/owner';
import { fetchStatus } from '../../api/upload';
import {
  BigButton,
  BigNumberTile,
  geist,
  ListRow,
  ListSection,
  radii,
  SegmentedControl,
  space,
  StoryEyebrow,
  StoryTitle,
  Txt,
  useDesign,
  withAlpha,
} from '@/design';

const detective = require('../../../assets/art/hedgehog-detective.png');
const party = require('../../../assets/art/hedgehog-party.png');
const POLL_MS = 4000;

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-api' }
  | { kind: 'needs-upload'; reason: string }
  | { kind: 'setup'; notice?: string }
  | { kind: 'match'; match: Match };

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * "What you and {first} have in common": the opt-in comparison between two Textrovert users. Never shown as something
 * we can work out from your chats alone: the other person must have the app, upload their own chats and accept.
 */
export function CommonGround({ friendId, first }: { friendId: string; first: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!API_URL) return setPhase({ kind: 'no-api' });
    if (!(await loadOwnerKey())) return setPhase({ kind: 'needs-upload', reason: 'You’re looking at the demo. Upload your own chats to compare with a friend.' });
    try {
      const status = await fetchStatus();
      if (status.owner !== 'account' || !status.upload || status.upload.status === 'failed') {
        return setPhase({ kind: 'needs-upload', reason: 'Upload your own chats first. Comparing only works between two people who have each uploaded theirs.' });
      }
    } catch {
      // /status is only a pre-check; the match routes check uploads themselves.
    }
    const matchId = await linkedMatchId(friendId);
    if (!matchId) return setPhase({ kind: 'setup' });
    try {
      setPhase({ kind: 'match', match: await fetchMatch(matchId) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        await unlinkMatch(friendId);
        return setPhase({ kind: 'setup', notice: 'That comparison was deleted, by you or the other person.' });
      }
      setPhase({ kind: 'setup', notice: message(error, 'Couldn’t load your comparison.') });
    }
  }, [friendId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep a pending comparison fresh while it's on screen.
  const matchId = phase.kind === 'match' ? phase.match._id : null;
  const settled = phase.kind === 'match' && isSettled(phase.match.status);
  useEffect(() => {
    if (!matchId || settled) return;
    let live = true;
    const timer = setInterval(async () => {
      try {
        const next = await fetchMatch(matchId);
        if (live) setPhase({ kind: 'match', match: next });
      } catch (error) {
        if (live && error instanceof ApiError && error.status === 404) load();
      }
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [matchId, settled, load]);

  const started = async (id: string) => {
    await linkMatch(friendId, id);
    setPhase({ kind: 'match', match: await fetchMatch(id) });
  };

  switch (phase.kind) {
    case 'loading':
      return <ActivityIndicator style={{ marginTop: space.huge }} />;
    case 'no-api':
      return <Explainer first={first} footer="Comparing needs the Textrovert server. This build runs without one, so it’s off here." />;
    case 'needs-upload':
      return (
        <Explainer first={first} footer={phase.reason}>
          <BigButton title="Upload your chats" emoji="📤" onPress={() => router.push('/onboarding')} />
        </Explainer>
      );
    case 'setup':
      return <Setup friendId={friendId} first={first} notice={phase.notice} onStarted={started} />;
    case 'match':
      return (
        <MatchView
          match={phase.match}
          first={first}
          onChange={(next) => setPhase({ kind: 'match', match: next })}
          onRemoved={async () => {
            await unlinkMatch(friendId);
            setPhase({ kind: 'setup' });
          }}
        />
      );
  }
}

function Explainer({ first, footer, children }: { first: string; footer?: string; children?: React.ReactNode }) {
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center' }}>
        <Image source={detective} style={{ width: 150, height: 150 }} resizeMode="contain" accessibilityIgnoresInvertColors accessible={false} />
      </View>
      <View style={{ gap: space.sm }}>
        <StoryEyebrow text="Friendship Wrapped" accent="lilac" />
        <Txt variant="title1" accessibilityRole="header">
          What you and {first} have in common
        </Txt>
      </View>
      <View style={{ gap: space.md }}>
        <Step n={1} text={`${first} needs Textrovert too, with their own chats uploaded.`} />
        <Step n={2} text="One of you sends an invite code. The other enters it to agree." />
        <Step n={3} text="Each side’s interests come only from messages that person sent. You both see the overlap, never each other’s messages." />
      </View>
      <Txt variant="footnote" tone="secondary">
        Your chats with {first} aren’t enough on their own: nothing is compared until {first} joins.
      </Txt>
      {footer ? (
        <Txt variant="subhead" tone="secondary">
          {footer}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const { c } = useDesign();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }} accessible accessibilityLabel={`${n}. ${text}`}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="footnote" tone="accent" style={{ fontWeight: '700' }}>
          {n}
        </Txt>
      </View>
      <Txt variant="callout" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, code }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; code?: boolean }) {
  const { c } = useDesign();
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600' }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        accessibilityLabel={label}
        autoCapitalize={code ? 'characters' : 'words'}
        autoCorrect={false}
        maxLength={code ? 8 : 40}
        style={{
          borderWidth: 1,
          borderColor: c.edge,
          backgroundColor: c.surface,
          borderRadius: radii.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          color: c.text,
          fontFamily: geist['500'],
          fontSize: code ? 22 : 17,
          letterSpacing: code ? 4 : 0,
        }}
      />
    </View>
  );
}

function Setup({ friendId, first, notice, onStarted }: { friendId: string; first: string; notice?: string; onStarted: (matchId: string) => Promise<void> }) {
  const { c } = useDesign();
  const [mode, setMode] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [others, setOthers] = useState<MatchSummary[]>([]);
  const touchedName = useRef(false);

  useEffect(() => {
    fetchSelfName().then((saved) => !touchedName.current && saved && setName(saved));
    (async () => {
      try {
        const [all, links] = await Promise.all([listMatches(), linkedMatchIds()]);
        const taken = new Set(Object.values(links));
        setOthers(all.filter((m) => !taken.has(m._id)));
      } catch {
        // Only a convenience; the invite flow works without it.
      }
    })();
  }, []);

  const inviting = mode === 0;
  const ready = agreed && name.trim().length > 0 && (inviting || code.replace(/[\s-]/g, '').length === 6) && !busy;

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    try {
      const id = inviting ? (await createInvite(name.trim())).matchId : await joinInvite(code, name.trim());
      await onStarted(id);
    } catch (e) {
      // Keep everything they typed; one action to retry.
      setError(message(e, inviting ? 'Couldn’t create the invite. Try again.' : 'Couldn’t join with that code. Try again.'));
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.xl }}>
      <Explainer first={first} footer={notice} />
      <SegmentedControl segments={[`Invite ${first}`, 'I have a code']} value={mode} onChange={(i) => (setMode(i), setError(undefined))} />
      <View style={{ gap: space.lg }}>
        {!inviting ? <Field label={`Code from ${first}`} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="ABC123" code /> : null}
        <Field label={`Your name, as ${first} knows you`} value={name} onChangeText={(v) => ((touchedName.current = true), setName(v))} placeholder="Your first name" />
        <Pressable
          onPress={() => setAgreed((a) => !a)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel={`I agree to show ${first} what we have in common`}
          style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: agreed ? c.accent : c.textTertiary,
              backgroundColor: agreed ? c.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {agreed ? (
              <Txt variant="footnote" color={c.onAccent} style={{ fontWeight: '800' }}>
                ✓
              </Txt>
            ) : null}
          </View>
          <Txt variant="subhead" style={{ flex: 1 }}>
            I agree to show {first} what we have in common: shared interests, how often each of us mentions them, and when we started. Not my messages.
          </Txt>
        </Pressable>
        {error ? (
          <Txt variant="subhead" color={c.danger} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        <BigButton title={busy ? (inviting ? 'Creating…' : 'Joining…') : inviting ? 'Create invite code' : `Join ${first}’s invite`} onPress={go} disabled={!ready} />
      </View>
      {others.length ? (
        <ListSection header="Your other comparisons" footer={`Started this from somewhere else? Tap one to show it on ${first}’s profile.`}>
          {others.map((m) => (
            <ListRow
              key={m._id}
              title={m.them ? `With ${m.them}` : `Invite ${m.code}`}
              subtitle={m.status === 'ready' ? `${m.shared ?? 0} in common` : m.status === 'waiting' ? 'Waiting for them to join' : m.status}
              onPress={() => onStarted(m._id)}
            />
          ))}
        </ListSection>
      ) : null}
    </View>
  );
}

function MatchView({ match, first, onChange, onRemoved }: { match: Match; first: string; onChange: (m: Match) => void; onRemoved: () => void }) {
  const { c } = useDesign();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const them = match.them?.name || first;

  const act = async (run: () => Promise<unknown>, after: () => Promise<void> | void) => {
    setBusy(true);
    setError(undefined);
    try {
      await run();
      await after();
    } catch (e) {
      setError(message(e, 'That didn’t work. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const title = match.them ? `Stop comparing with ${them}?` : 'Cancel this invite?';
    const body = match.them ? `This deletes the result for both of you. ${them} won’t see it anymore.` : 'The code stops working.';
    const confirm = () => act(() => removeMatch(match._id), onRemoved);
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${body}`) ?? true) confirm();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Keep', style: 'cancel' },
      { text: match.them ? 'Delete for both' : 'Cancel invite', style: 'destructive', onPress: confirm },
    ]);
  };

  const footer = (
    <View style={{ gap: space.md }}>
      {error ? (
        <Txt variant="subhead" color={c.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      <Pressable onPress={remove} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: space.md }}>
        <Txt variant="subhead" color={c.danger} style={{ fontWeight: '600' }}>
          {match.them ? 'Stop comparing (deletes it for both of you)' : 'Cancel invite'}
        </Txt>
      </Pressable>
    </View>
  );

  if (match.status === 'waiting') {
    const share = async () => {
      try {
        await Share.share({ message: `I’d like to see what we have in common on Textrovert. Open it, upload your chats, and enter my invite code: ${match.code}` });
      } catch {
        // Sharing isn't available everywhere (some browsers); the code is on screen to copy.
      }
    };
    return (
      <View style={{ gap: space.xl }}>
        <StoryEyebrow text="Invite sent" accent="yellow" />
        <Txt variant="title1" accessibilityRole="header">
          Send {first} this code
        </Txt>
        <View style={{ backgroundColor: c.surfaceMuted, borderRadius: radii.xl, paddingVertical: space.xxl, alignItems: 'center', gap: space.sm }}>
          <Txt selectable variant="stat" style={{ letterSpacing: 8, fontFamily: geist['700'] }} accessibilityLabel={`Invite code ${match.code.split('').join(' ')}`}>
            {match.code}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            Works once. Only someone with this code can join.
          </Txt>
        </View>
        <BigButton title="Share the code" emoji="💌" onPress={share} />
        <Txt variant="subhead" tone="secondary">
          {first} opens Textrovert, uploads their own chats, then opens your profile there and enters the code under “In common”. Nothing is compared until they do.
        </Txt>
        {footer}
      </View>
    );
  }

  if (match.status === 'analyzing' || match.status === 'comparing') {
    return (
      <View style={{ gap: space.xl }}>
        <StoryEyebrow text={match.status === 'comparing' ? 'Comparing' : 'Getting ready'} accent="mint" />
        <Txt variant="title1" accessibilityRole="header">
          You and {them} are in
        </Txt>
        <View style={{ gap: space.md }}>
          <Progress label={sideLabel(match.you.state, 'You')} done={match.you.state === 'ready'} failed={match.you.state === 'failed'} />
          <Progress label={sideLabel(match.them?.state, them)} done={match.them?.state === 'ready'} failed={match.them?.state === 'failed'} />
          <Progress label={match.status === 'comparing' ? 'Comparing your interests' : 'Comparing once both are ready'} done={false} failed={false} active={match.status === 'comparing'} />
        </View>
        <Txt variant="subhead" tone="secondary">
          Usually a minute or two. You can leave; it keeps going.
        </Txt>
        {footer}
      </View>
    );
  }

  if (match.status === 'failed') {
    return (
      <View style={{ gap: space.xl }}>
        <StoryEyebrow text="Didn’t finish" accent="coral" />
        <Txt variant="title1" accessibilityRole="header">
          Comparing stopped
        </Txt>
        <Txt variant="body" tone="secondary">
          {match.error || 'Something went wrong while comparing.'}
        </Txt>
        <BigButton title={busy ? 'Starting…' : 'Try again'} disabled={busy} onPress={() => act(() => rerunMatch(match._id), async () => onChange(await fetchMatch(match._id)))} />
        {footer}
      </View>
    );
  }

  return <Results match={match} them={them} footer={footer} />;
}

function Progress({ label, done, failed, active }: { label: string; done: boolean; failed: boolean; active?: boolean }) {
  const { c } = useDesign();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} accessible accessibilityLabel={`${label}${done ? ', done' : failed ? ', failed' : ''}`}>
      <View style={{ width: 28, alignItems: 'center' }}>
        {done ? (
          <Txt variant="headline" color={c.success}>
            ✓
          </Txt>
        ) : failed ? (
          <Txt variant="headline" color={c.danger}>
            ×
          </Txt>
        ) : active ? (
          <ActivityIndicator />
        ) : (
          <Txt variant="headline" tone="tertiary">
            ○
          </Txt>
        )}
      </View>
      <Txt variant="callout" style={{ flex: 1 }}>
        {label}
      </Txt>
    </View>
  );
}

const year = (ms: number | null) => (ms ? new Date(ms).getFullYear() : null);

function Results({ match, them, footer }: { match: Match; them: string; footer: React.ReactNode }) {
  const items = match.result?.items ?? [];
  const hidden = items.filter((i) => i.hidden);
  const known = items.filter((i) => !i.hidden);
  return (
    <View style={{ gap: space.xxl }}>
      <View style={{ gap: space.md }}>
        <StoryEyebrow text="Friendship Wrapped" accent="pink" />
        <StoryTitle>{`You & ${them}`}</StoryTitle>
      </View>
      {items.length === 0 ? (
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Image source={party} style={{ width: 140, height: 140 }} resizeMode="contain" accessible={false} />
          <Txt variant="body" tone="secondary" style={{ textAlign: 'center' }}>
            No shared interests turned up this time. That can change as you both upload more chats.
          </Txt>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <BigNumberTile value={String(items.length)} label="in common" emoji="🤝" accent="mint" />
          </View>
          <View style={{ flex: 1 }}>
            <BigNumberTile value={String(hidden.length)} label="you haven’t talked about" emoji="🤫" accent="lilac" />
          </View>
        </View>
      )}
      {hidden.length ? (
        <View style={{ gap: space.md }}>
          <Txt variant="title3" accessibilityRole="header">
            New to each other
          </Txt>
          {hidden.map((item) => (
            <Item key={item.title} item={item} them={them} />
          ))}
        </View>
      ) : null}
      {known.length ? (
        <View style={{ gap: space.md }}>
          <Txt variant="title3" accessibilityRole="header">
            You already talk about
          </Txt>
          {known.map((item) => (
            <Item key={item.title} item={item} them={them} />
          ))}
        </View>
      ) : null}
      <Txt variant="footnote" tone="secondary">
        Built from each person’s interests, found only in messages they sent. Neither of you saw the other’s messages.
        {match.result?.builtAt ? ` Updated ${new Date(match.result.builtAt).toLocaleDateString()}.` : ''}
      </Txt>
      {footer}
    </View>
  );
}

function Item({ item, them }: { item: SharedItem; them: string }) {
  const { c } = useDesign();
  const since = (side: SharedItem['you']) => (year(side.since) ? ` · since ${year(side.since)}` : '');
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.edge, padding: space.lg, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <Txt variant="headline" style={{ flex: 1 }}>
          {item.title}
        </Txt>
        <Txt variant="caption" tone="secondary">
          {item.category}
        </Txt>
      </View>
      <Txt variant="subhead">
        <Txt variant="subhead" style={{ fontWeight: '600' }}>
          You:{' '}
        </Txt>
        {item.you.detail}
        <Txt variant="subhead" tone="secondary">
          {since(item.you)}
        </Txt>
      </Txt>
      <Txt variant="subhead">
        <Txt variant="subhead" style={{ fontWeight: '600' }}>
          {them}:{' '}
        </Txt>
        {item.them.detail}
        <Txt variant="subhead" tone="secondary">
          {since(item.them)}
        </Txt>
      </Txt>
      <Txt variant="footnote" tone="secondary">
        {item.betweenYou === 0 ? 'Hasn’t come up in your chats with each other' : `Came up ${item.betweenYou} time${item.betweenYou === 1 ? '' : 's'} between you`}
      </Txt>
      {item.starter ? (
        <View style={{ backgroundColor: withAlpha(c.accent, 0.1), borderRadius: radii.md, padding: space.md, marginTop: space.xs }}>
          <Txt variant="subhead" tone="accent">
            Try: “{item.starter}”
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

