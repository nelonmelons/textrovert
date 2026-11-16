// Text helpers that reproduce Swift String semantics: grapheme clusters as characters, Character.isLetter /
// isNumber / isWhitespace from the first scalar, and the default-exclusion classifier.

export type WrappedSensitivity = "conflict" | "privateTopic" | "roastOfOther";

type Segmenter = { segment(input: string): Iterable<{ segment: string }> };
const IntlWithSegmenter = Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => Segmenter };
const segmenter: Segmenter | null = IntlWithSegmenter.Segmenter ? new IntlWithSegmenter.Segmenter(undefined, { granularity: "grapheme" }) : null;

// Used where Intl.Segmenter is missing (older Hermes): a base with its marks, joiners, modifiers and keycaps, or a flag pair.
const fallbackCluster =
  /\r\n|\p{Regional_Indicator}{2}|(?:\P{M})(?:[\p{M}\u{FE0E}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\u{200D}\P{M})*|\p{M}+/gsu;

/** Grapheme clusters, the units Swift counts and iterates as Characters. */
export function characters(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return text.match(fallbackCluster) ?? [];
}

/** Swift's String.count. */
export function characterCount(text: string): number {
  if (/^[\x00-\x7F]*$/.test(text) && !text.includes("\r\n")) return text.length;
  return characters(text).length;
}

const firstScalar = (c: string) => String.fromCodePoint(c.codePointAt(0) ?? 0);
const isLetter = (c: string) => /\p{Alphabetic}/u.test(firstScalar(c));
const isNumber = (c: string) => /\p{N}/u.test(firstScalar(c));
const isWhitespace = (c: string) => /\p{White_Space}/u.test(firstScalar(c));

/** CharacterSet.whitespacesAndNewlines: Unicode Z categories, U+0009–U+000D and U+0085. */
export function trimmed(text: string): string {
  return text.replace(/^[\p{Z}\t\n\v\f\r\u0085]+|[\p{Z}\t\n\v\f\r\u0085]+$/gu, "");
}

/** Swift's String < String: code point order (JS < compares UTF-16 units, which differs above U+FFFF). */
export function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  const x = a.normalize("NFC"), y = b.normalize("NFC");
  const ia = x[Symbol.iterator](), ib = y[Symbol.iterator]();
  for (;;) {
    const ca = ia.next(), cb = ib.next();
    if (ca.done || cb.done) return ca.done ? (cb.done ? 0 : -1) : 1;
    const d = (ca.value.codePointAt(0) ?? 0) - (cb.value.codePointAt(0) ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
}

export const stopwords: ReadonlySet<string> = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "you're", "youre", "with", "that", "this", "was", "were", "have", "has", "had",
  "its", "it's", "i'm", "im", "i'll", "ill", "i've", "ive", "i'd", "just", "can", "can't", "cant", "don't", "dont", "did", "didn't", "does",
  "what", "when", "where", "who", "why", "how", "all", "any", "out", "get", "got", "from", "they", "them", "then", "than", "there", "their",
  "about", "would", "could", "should", "will", "going", "gonna", "one", "yes", "yeah", "okay", "ok", "also", "too", "very", "really", "now",
  "like", "some", "into", "over", "still", "only", "even", "much", "more", "most", "been", "being", "she", "her", "him", "his", "our", "ours",
  "mine", "myself", "let's", "lets", "here", "make", "made", "need", "want", "know", "think", "said", "say", "see", "saw", "way", "back",
  "good", "time", "thing", "things", "pls", "please", "thanks", "thank", "sure", "well", "anyway", "which", "while", "again", "because",
]);

/**
 * Everyday chat words that recur in any conversation, so they never make a running joke on their own:
 * fillers, slang, time words and generic verbs. Real chats were dominated by "wait", "today" and "aight" without it.
 */
export const fillerWords: ReadonlySet<string> = new Set([
  "wait", "aight", "alright", "ight", "okay", "okayy", "yeah", "yeahh", "yess", "yesss", "nope", "yeap", "yup", "nahh", "sure", "fine",
  "cool", "nice", "true", "down", "fr", "frfr", "deadass", "bruh", "bro", "bros", "dude", "guys", "man", "lmao", "lmfao", "haha", "hahaha", "hahah",
  "lmaoo", "lmaooo", "omg", "idk", "lmk", "ngl", "tbh", "imma", "gotta", "wanna", "kinda", "sorta", "tho", "though", "literally", "actually",
  "probably", "maybe", "definitely", "honestly", "basically", "pretty", "super", "damn", "shit", "fuck", "fucking", "type", "today", "tonight",
  "tomorrow", "yesterday", "morning", "night", "week", "weekend", "later", "soon", "rn", "next", "last", "first", "every", "always", "never",
  "already", "else", "right", "real", "really", "something", "anything", "nothing", "everything", "someone", "anyone", "everyone", "stuff",
  "people", "place", "work", "home", "call", "text", "sent", "send", "come", "coming", "came", "goes", "went", "getting", "doing", "done",
  "having", "saying", "trying", "looking", "thinking", "working", "tell", "told", "mean", "means", "feel", "look", "looks", "take", "give",
  "keep", "find", "help", "show", "start", "stop", "talk", "watch", "play", "leave", "meet", "these", "those", "other", "another", "same",
  "great", "better", "best", "little", "long", "love", "sorry", "didnt", "isnt", "wont", "thats", "whats", "theres", "youll", "hes", "shes",
]);

export function normalized(text: string): string {
  return text.toLowerCase().replaceAll("\u2019", "'");
}

export function tokens(text: string): string[] {
  const result: string[] = [];
  let current = "";
  const flush = () => {
    let t = current;
    while (t.startsWith("'")) t = t.slice(1);
    while (t.endsWith("'")) t = t.slice(0, -1);
    if (t) result.push(t);
    current = "";
  };
  for (const c of characters(normalized(text))) {
    if (isLetter(c) || isNumber(c) || c === "'") current += c;
    else flush();
  }
  flush();
  return result;
}

export function content(tokenList: string[]): string[] {
  return tokenList.filter((t) => characterCount(t) >= 3 && !stopwords.has(t));
}

/** text.split(whereSeparator: \.isWhitespace).count */
export function wordCount(text: string): number {
  let count = 0;
  let inWord = false;
  for (const c of characters(text)) {
    if (isWhitespace(c)) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

const laughTokens = new Set(["lol", "lmao", "lmfao", "haha", "hahaha", "hehe", "rofl"]);

export function laughs(text: string): boolean {
  const n = normalized(text);
  return (
    tokens(text).some((t) => laughTokens.has(t)) ||
    n.includes("😂") || n.includes("🤣") || n.includes("💀") || n.includes("i'm dead") || n.includes("crying")
  );
}

const conflictPhrases = [
  "upset with", "upset that", "mad at", "wish you'd told", "wish you had told", "you always", "you never", "leave me alone",
  "stop texting", "fed up", "disappointed in", "hurt my feelings", "i hate you", "i hate this", "not talking to", "i'm sorry", "im sorry",
  "apolog", "blocked you", "break up", "breaking up", "breakup",
];
// Texting shorthand for the phrases above, matched on whole tokens so "u" never matches inside a word.
const conflictShorthand = ["i hate u", "mad at u", "upset with u", "disappointed in u", "u always", "u never", "wish u told", "wish u had told"];
const conflictWords = new Set(["angry", "furious", "pissed", "livid", "resent", "argument", "fight", "fighting"]);
const privatePhrases = ["social security", "credit card", "my address", "verification code", "passed away", "panic attack", "owe you", "i owe"];
const privateWords = new Set([
  "password", "passcode", "ssn", "diagnosis", "diagnosed", "therapy", "therapist", "medication", "anxiety", "depressed", "depression",
  "pregnant", "surgery", "hospital", "chemo", "cancer", "funeral", "salary", "paycheck", "debt", "loan", "otp", "rent", "venmo", "zelle", "mortgage",
]);
const insultWords = new Set([
  "idiot", "dumb", "stupid", "loser", "annoying", "pathetic", "clown", "trash", "useless", "ugly", "lame", "worst", "moron",
]);

export function sensitivity(text: string, fromOwner: boolean, friendFirstName: string): WrappedSensitivity | null {
  const n = normalized(text);
  const t = new Set(tokens(text));
  const any = (words: Iterable<string>) => [...words].some((w) => t.has(w));
  const joined = " " + tokens(text).join(" ") + " ";
  if (conflictPhrases.some((p) => n.includes(p)) || conflictShorthand.some((p) => joined.includes(" " + p + " ")) || any(conflictWords)) return "conflict";
  if (privatePhrases.some((p) => n.includes(p)) || any(privateWords)) return "privateTopic";
  const addressesFriend = any(["you", "your", "you're", "youre", "u", "ur", friendFirstName.toLowerCase()]);
  if (fromOwner && addressesFriend && any(insultWords)) return "roastOfOther";
  return null;
}
