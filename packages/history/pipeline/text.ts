const MOJIBAKE_RE = /[\u00c2-\u00f4][\u0080-\u00bf]/;
const utf8Strict = new TextDecoder("utf-8", { fatal: true });

/**
 * Instagram and Messenger exports write each UTF-8 byte as its own \\u00XX code point
 * ("Ã°ÂŸÂ˜Â‚" instead of "😂"). Re-decode those strings; leave real Latin-1 text alone.
 */
export function fixMojibake(value: string): string {
  if (!MOJIBAKE_RE.test(value)) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return value;
    bytes[i] = code;
  }
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return value;
  }
}

/** Lowercased letters and digits only, for matching the same person across exports. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}']*/gu;
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;
const TEXT_STYLE_EMOJI_RE = /(?!\p{Emoji_Presentation})\p{Extended_Pictographic}(?!\p{Emoji_Modifier})/gu;
const LAUGH_RE = /\b(?:l+o+l+(?:o+l+)*|lmf?a+o+|rofl|a?(?:h[ae]){2,}h?|(?:he){2,})\b|\u{1F602}|\u{1F923}|\u{1F480}/iu;

export function countUrls(text: string): number {
  return text.match(URL_RE)?.length ?? 0;
}

/** Lowercase word tokens with URLs removed. */
export function words(text: string): string[] {
  return text.replace(URL_RE, " ").replace(/\u2019/g, "'").toLowerCase().match(WORD_RE) ?? [];
}

/** Emojis in the text, each in its fully-qualified form so "❤" and "❤️" count as one and render in color. */
export function emojis(text: string): string[] {
  return (text.match(EMOJI_RE) ?? []).map((e) => e.replace(/\uFE0F/g, "").replace(TEXT_STYLE_EMOJI_RE, "$&\uFE0F"));
}

export function isLaugh(text: string): boolean {
  return LAUGH_RE.test(text);
}

export function isTopWordCandidate(word: string): boolean {
  return word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word);
}

const STOPWORDS = new Set(
  (
    "the and you that this was for are with have not but what all were when your can there will one out they would " +
    "about been has had him his her she them then than these those who whom which into its it's our ours their theirs " +
    "from just like get got also very more most some any each other such only own same too can't don't didn't doesn't " +
    "isn't wasn't won't wouldn't couldn't shouldn't i'm i've i'll i'd you're you've you'll you'd he's she's we're we've " +
    "they're they've that's there's what's where's let's how why where here because while being over again further once " +
    "off down under above below should could did does doing done just now yes yeah yea okay ok lol well even still really " +
    "gonna wanna gotta going know think thing things want need make made said say see way much many back good right sure " +
    "im ive ill id dont didnt doesnt isnt wasnt cant wont thats theres whats u ur ya tho thru"
  ).split(" "),
);
