import { View } from 'react-native';

import { Chip, fillFor, space } from '@/design';
import type { Citation } from '@/api/client';

const MAX_CHATS = 3;
const MAX_LABEL = 22;

export interface ChatGroup {
  chatId: string;
  chat: string;
  isDm: boolean;
  citations: Citation[];
}

/** Citations grouped by chat in order of first use. */
export function groupByChat(citations: Citation[]): ChatGroup[] {
  const groups = new Map<string, ChatGroup>();
  for (const c of citations) {
    const g = groups.get(c.chatId) ?? { chatId: c.chatId, chat: c.chat, isDm: !!c.isDm, citations: [] };
    g.citations.push(c);
    groups.set(c.chatId, g);
  }
  return [...groups.values()];
}

/** A chat's name: the friend for a DM, the group's title otherwise. */
export const chatName = (g: ChatGroup) => (g.isDm ? (g.citations.find((c) => !c.fromMe)?.sender ?? g.chat) : g.chat) || 'A chat';

const short = (label: string) => (label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1).trimEnd() + '…' : label);

/** The sources under an answer: one tinted chip per chat with its message count, and "+N more" past three chats. */
export function Sources({ citations, onOpen }: { citations: Citation[]; onOpen: (focus?: number) => void }) {
  const groups = groupByChat(citations);
  const shown = groups.slice(0, MAX_CHATS);
  const rest = groups.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
      {shown.map((g) => (
        <Chip
          key={g.chatId}
          label={short(chatName(g))}
          emoji={g.isDm ? '💬' : '👥'}
          count={g.citations.length}
          tint={fillFor(g.chatId)}
          accessibilityLabel={`${g.citations.length} ${g.citations.length === 1 ? 'source' : 'sources'} in ${chatName(g)}`}
          onPress={() => onOpen(g.citations[0].n)}
        />
      ))}
      {rest > 0 ? <Chip label={`+${rest} more`} accessibilityLabel={`${rest} more ${rest === 1 ? 'chat' : 'chats'}`} onPress={() => onOpen()} /> : null}
    </View>
  );
}
