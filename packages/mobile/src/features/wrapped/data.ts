import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  WrappedController, WrappedEditionStore, dateRangeFromDays, wallTime,
  type WrappedConversation, type WrappedDateRange, type WrappedOutcome, type WrappedParticipant, type WrappedRemoteSource,
} from '@textrovert/wrapped';

import { postJson } from '@/api/client';

/** POST /wrapped's answer (packages/history/pipeline/assistant/wrappedApi.ts). */
export interface WrappedResponse {
  conversation: { id: string; service: string; participants: WrappedParticipant[]; title: string; kind: string; ownerID: string };
  range: WrappedDateRange;
  outcome: WrappedOutcome;
  wider: WrappedDateRange | null;
}

interface WrappedBody {
  conversationId: string;
  from?: string;
  through?: string;
  avoiding?: string[];
  number?: number;
}

/** The server reads the chat and asks its model, which takes a while on long chats. */
const WRAPPED_TIMEOUT_MS = 150_000;

export const fetchWrapped = (body: WrappedBody) =>
  postJson<WrappedResponse>('/wrapped', body, WRAPPED_TIMEOUT_MS);

/** YYYY-MM-DD of an instant in a time zone. */
export function localDay(ms: number, timeZone: string): string {
  const t = wallTime(ms, timeZone);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

/** What the app remembers about a chat so a reopen needs no request: who is in it, and the range last shown. */
interface ChatMeta {
  conversation: WrappedConversation;
  ownerID: string;
  range: WrappedDateRange;
}

const META_KEY = 'textrovert.wrapped.chats.v1';
let storePromise: Promise<WrappedEditionStore> | null = null;
const editionStore = () => (storePromise ??= WrappedEditionStore.open(AsyncStorage));

async function readMeta(): Promise<Record<string, ChatMeta>> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMeta(id: string, meta: ChatMeta) {
  const all = await readMeta();
  all[id] = meta;
  await AsyncStorage.setItem(META_KEY, JSON.stringify(all));
}

export type WrappedState =
  | { kind: 'starting' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; controller: WrappedController };

/**
 * One chat's Wrapped: a WrappedController whose editions come from POST /wrapped and are cached in AsyncStorage.
 * Without from/through it reopens the range shown last time, or the server's default (the 30 days ending on the
 * chat's last message). The first request's answer becomes edition 1, so opening costs one request.
 */
export function useWrapped(conversationId: string, from?: string, through?: string) {
  const [state, setState] = useState<WrappedState>({ kind: 'starting' });
  const [, setVersion] = useState(0);
  const attempt = useRef(0);

  const start = useCallback(async () => {
    const mine = ++attempt.current;
    setState({ kind: 'starting' });
    try {
      const explicit = from !== undefined && through !== undefined;
      const [store, metas] = await Promise.all([editionStore(), readMeta()]);
      let meta: ChatMeta | undefined = metas[conversationId];
      let range = meta ? (explicit ? dateRangeFromDays(from, through, meta.range.timeZone) : meta.range) : null;
      let preload: WrappedResponse | null = null;
      if (!meta || !range) {
        preload = await fetchWrapped({ conversationId, ...(explicit ? { from, through } : {}) });
        meta = { conversation: { id: preload.conversation.id, service: preload.conversation.service, participants: preload.conversation.participants, messages: [] }, ownerID: preload.conversation.ownerID, range: preload.range };
        range = preload.range;
        if (store.session(WrappedEditionStore.key(meta.ownerID, conversationId, range)).editions.length > 0) preload = null;
        await saveMeta(conversationId, meta);
      }
      const known = meta;
      const remote: WrappedRemoteSource = {
        async generate(req) {
          if (preload && req.number === 1 && req.avoiding.length === 0 && preload.range.start === req.range.start && preload.range.end === req.range.end) {
            const { outcome, wider } = preload;
            preload = null;
            return { outcome, wider };
          }
          const tz = req.range.timeZone;
          const res = await fetchWrapped({ conversationId, from: localDay(req.range.start, tz), through: localDay(req.range.end - 1, tz), avoiding: req.avoiding, number: req.number });
          return { outcome: res.outcome, wider: res.wider };
        },
      };
      const controller = new WrappedController({ conversation: known.conversation, ownerID: known.ownerID, range, store, remote });
      let shownRange = range;
      controller.subscribe(() => {
        setVersion((v) => v + 1);
        if (controller.range !== shownRange) {
          shownRange = controller.range;
          if (!explicit) void saveMeta(conversationId, { ...known, range: controller.range });
        }
      });
      if (mine !== attempt.current) return;
      setState({ kind: 'ready', controller });
      void controller.open();
    } catch (error) {
      if (mine === attempt.current) setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }, [conversationId, from, through]);

  useEffect(() => {
    void start();
    return () => {
      attempt.current++;
    };
  }, [start]);

  return { state, retry: start };
}
