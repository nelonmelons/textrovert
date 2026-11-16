import { Fragment, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChatBubble, ChatPanel, EmojiAvatar, geist, ListRow, ListSection, space, Txt, useDesign, withAlpha } from '@/design';
import { FadeIn } from '@/components/FadeIn';
import { senderLabel, type ApiMessage, type Citation } from '@/api/client';
import { formatSent } from '@/lib/answer';
import { chatName, groupByChat } from './Sources';

const CLAMP_LINES = 6;
/** Messages past this length or line count clamp to CLAMP_LINES with a "Show full message" toggle. */
const LONG_CHARS = 280;
const LONG_LINES = 6;
/** When the quote sits deep in a long message, the clamped view starts this many characters before it. */
const LEAD_IN = 60;

/**
 * The cited messages behind an answer as quoted bubbles, grouped by chat with the tapped one's chat first and the tapped
 * message ringed. The messages around each one sit muted for context. Below, each chat opens in full.
 */
export function Receipts({ citations, focus, onOpenChat }: { citations: Citation[]; focus?: number; onOpenChat: (source: Citation) => void }) {
  const { c } = useDesign();
  const all = groupByChat(citations);
  const first = all.findIndex((g) => g.citations.some((x) => x.n === focus));
  const groups = first > 0 ? [all[first], ...all.filter((_, i) => i !== first)] : all;
  return (
    <>
      <ChatPanel style={{ gap: space.md }}>
        {groups.map((g, gi) => (
          <Fragment key={g.chatId}>
            <View style={{ alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: c.fill, marginTop: gi ? space.sm : 0 }}>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {(g.isDm ? '💬 ' : '👥 ') + chatName(g)}
              </Txt>
            </View>
            {g.citations.map((x, i) => (
              <FadeIn key={x.n} delay={Math.min(gi + i, 4) * 50} style={{ gap: space.sm }}>
                <Receipt citation={x} focused={x.n === focus} />
              </FadeIn>
            ))}
          </Fragment>
        ))}
      </ChatPanel>
      <ListSection header="Open in chat">
        {groups.map((g) => (
          <ListRow
            key={g.chatId}
            title={chatName(g)}
            subtitle={(g.isDm ? 'Your DM' : 'Group chat') + ' · ' + g.citations.length + (g.citations.length === 1 ? ' message' : ' messages')}
            leading={g.isDm ? <EmojiAvatar name={chatName(g)} size={36} /> : <EmojiAvatar emoji="👥" name={g.chatId} size={36} />}
            onPress={() => onOpenChat(g.citations[0])}
          />
        ))}
      </ListSection>
      <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Word for word from your imported chats.
      </Txt>
    </>
  );
}

function Receipt({ citation: x, focused }: { citation: Citation; focused: boolean }) {
  const [full, setFull] = useState(false);
  const long = x.text.length > LONG_CHARS || x.text.split('\n').length > LONG_LINES;
  return (
    <>
      <Context messages={x.before} />
      <ChatBubble mine={x.fromMe} name={senderLabel(x)} time={formatSent(x.sentAt)} highlighted={focused}>
        <Excerpt text={x.text} quote={x.quote} full={full || !long} />
        {long ? (
          <Pressable accessibilityRole="button" onPress={() => setFull((f) => !f)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Txt variant="footnote" tone="accent" style={{ fontWeight: '600' }}>
              {full ? 'Show less' : 'Show full message'}
            </Txt>
          </Pressable>
        ) : null}
      </ChatBubble>
      <Context messages={x.after} />
    </>
  );
}

/** The messages around a cited one, muted, so the receipt reads in context. */
function Context({ messages }: { messages?: ApiMessage[] }) {
  if (!messages?.length) return null;
  return (
    <View style={{ gap: space.sm, opacity: 0.5 }}>
      {messages.map((m, i) => (
        <ChatBubble key={i} mine={m.fromMe} name={senderLabel(m)} time={formatSent(m.sentAt)} text={m.text.length > 160 ? m.text.slice(0, 159).trimEnd() + '…' : m.text} />
      ))}
    </View>
  );
}

/** Where the quote sits in the message, ignoring case; -1 when it is missing or is (nearly) the whole message. */
function findQuote(text: string, quote: string) {
  const q = quote.trim();
  if (!q || q.length >= text.trim().length * 0.9) return -1;
  return text.toLowerCase().indexOf(q.toLowerCase());
}

/** The message with only the quoted span washed in the accent; clamped, it opens a little before the quote. */
function Excerpt({ text, quote, full }: { text: string; quote: string; full: boolean }) {
  const { c } = useDesign();
  const at = findQuote(text, quote);
  const q = quote.trim();
  let start = 0;
  if (!full && at > LEAD_IN * 2) {
    const space = text.indexOf(' ', at - LEAD_IN);
    start = space > 0 && space < at ? space + 1 : at;
  }
  const style = { fontFamily: geist['400'], fontSize: 16, lineHeight: 22, color: c.bubbleText };
  const lines = full ? undefined : CLAMP_LINES;
  if (at < 0)
    return (
      <Text numberOfLines={lines} style={style}>
        {text}
      </Text>
    );
  return (
    <Text numberOfLines={lines} style={style}>
      {start > 0 ? '…' : ''}
      {text.slice(start, at)}
      <Text style={{ backgroundColor: withAlpha(c.accent, 0.22), fontFamily: geist['600'] }}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </Text>
  );
}
