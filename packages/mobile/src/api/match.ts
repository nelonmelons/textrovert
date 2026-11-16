import AsyncStorage from '@react-native-async-storage/async-storage';
import { getJson, postJson } from './client';
import { loadOwnerKey } from './owner';

/**
 * Matching ("what you have in common") over the hosted API's /matches and /match routes, which wrap
 * packages/history/convex/matches.ts. Two people who have each uploaded their own chats opt in: one creates an invite
 * code, the other joins with it. Each side's interests come only from messages that person sent, and the result shows
 * only the overlap, never anyone's messages.
 */

export type MatchStatus = 'waiting' | 'analyzing' | 'comparing' | 'ready' | 'failed';
export type SideState = 'uploading' | 'needs_upload' | 'analyzing' | 'ready' | 'failed';

export interface SharedSide {
  detail: string;
  mentions: number;
  /** ms since epoch: when this person first mentioned it, if known. */
  since: number | null;
}

export interface SharedItem {
  title: string;
  category: string;
  match: 'same' | 'activity' | 'related';
  /** True when it (almost) never came up in your chats with each other. */
  hidden: boolean;
  /** How often it came up in your chats with each other. */
  betweenYou: number;
  starter: string;
  you: SharedSide;
  them: SharedSide;
}

export interface Match {
  _id: string;
  code: string;
  status: MatchStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  you: { name: string; state: SideState; messages: number | null };
  them: { name: string; state: SideState } | null;
  result: { items: SharedItem[]; sharedChats: number; builtAt: number } | null;
}

export interface MatchSummary {
  _id: string;
  code: string;
  status: MatchStatus;
  them: string | null;
  shared: number | null;
  hidden: number | null;
  updatedAt: number;
}

export const listMatches = () => getJson<{ matches: MatchSummary[] }>('/matches').then((r) => r.matches);
export const fetchMatch = (matchId: string) => getJson<{ match: Match }>('/match?id=' + encodeURIComponent(matchId)).then((r) => r.match);
export const createInvite = (name: string) => postJson<{ matchId: string; code: string }>('/matches', { name });
export const joinInvite = (code: string, name: string) => postJson<{ matchId: string }>('/matches/join', { code, name }).then((r) => r.matchId);
export const rerunMatch = (matchId: string) => postJson<{ ok: true }>('/match/rerun', { matchId });
export const removeMatch = (matchId: string) => postJson<{ ok: true }>('/match/remove', { matchId });

/** The name onboarding saved for this account, to prefill "the name they know you by". */
export const fetchSelfName = () =>
  getJson<{ onboarding: { selfName?: string | null } | null }>('/onboarding')
    .then((r) => r.onboarding?.selfName?.trim() || '')
    .catch(() => '');

/**
 * Which comparison belongs to which friend profile. The server only knows two accounts and the names they chose, so
 * the phone remembers the profile a comparison was started from. Links are kept per account, so another account on
 * this phone never sees them.
 */
const LINKS_KEY = 'textrovert.matchLinks.v1';
type Links = Record<string, Record<string, string>>;

async function readLinks(): Promise<Links> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(LINKS_KEY)) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Links) : {};
  } catch {
    return {};
  }
}

async function writeLinks(links: Links) {
  try {
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // Without storage the link lasts this session only; the comparison itself is still on the server.
  }
}

export async function linkedMatchIds(): Promise<Record<string, string>> {
  const owner = await loadOwnerKey();
  return owner ? ((await readLinks())[owner] ?? {}) : {};
}

export async function linkedMatchId(friendId: string): Promise<string | null> {
  return (await linkedMatchIds())[friendId] ?? null;
}

export async function linkMatch(friendId: string, matchId: string) {
  const owner = await loadOwnerKey();
  if (!owner) return;
  const links = await readLinks();
  const mine = Object.fromEntries(Object.entries(links[owner] ?? {}).filter(([, id]) => id !== matchId));
  links[owner] = { ...mine, [friendId]: matchId };
  await writeLinks(links);
}

export async function unlinkMatch(friendId: string) {
  const owner = await loadOwnerKey();
  if (!owner) return;
  const links = await readLinks();
  if (!links[owner]?.[friendId]) return;
  const { [friendId]: _gone, ...rest } = links[owner];
  links[owner] = rest;
  await writeLinks(links);
}

/** Shown until the comparison is ready: what each side is waiting on, in plain words. */
export function sideLabel(state: SideState | undefined, who: string): string {
  switch (state) {
    case 'needs_upload':
      return `Waiting for ${who} to upload chats`;
    case 'uploading':
      return `${who === 'You' ? 'Your' : who + '’s'} upload is still processing`;
    case 'analyzing':
      return `Finding ${who === 'You' ? 'your' : who + '’s'} interests`;
    case 'ready':
      return `${who === 'You' ? 'Your' : who + '’s'} interests are ready`;
    case 'failed':
      return `Couldn’t read ${who === 'You' ? 'your' : who + '’s'} interests`;
    default:
      return `Waiting for ${who} to join`;
  }
}

export const isSettled = (status: MatchStatus) => status === 'ready' || status === 'failed';
