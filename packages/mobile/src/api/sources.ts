import { router } from 'expo-router';
import type { Source } from './client';

/** Live source messages by id, so Emma's /source sheet can show one without putting the message in the URL. */
const known = new Map<string, Source>();

export const sourceById = (id: string | undefined) => (id ? known.get(id) : undefined);

/** Forgets every message opened so far; call it on log out so the previous account's messages don't stay in memory. */
export const forgetSources = () => known.clear();

/** Opens Emma's source sheet on a message from the API; quote is the span to call out, when there is one. */
export function openLiveSource(source: Source, quote?: string) {
  known.set(String(source.messageId), source);
  router.push({ pathname: '/source', params: { live: String(source.messageId), ...(quote ? { quote } : {}) } });
}
