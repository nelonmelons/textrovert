const QUOTE = 34;
const BACKSLASH = 92;
const OPEN_OBJECT = 123;
const CLOSE_OBJECT = 125;
const OPEN_ARRAY = 91;
const CLOSE_ARRAY = 93;
const COLON = 58;
const COMMA = 44;

interface Frame {
  array: boolean;
  key: string | null;
  expectKey: boolean;
}

/**
 * Yields each object element of the JSON array at `path` (object keys from the root; [] means the root is the
 * array) without holding the whole document in memory. Used for exports that can be hundreds of MB,
 * like ChatGPT's conversations.json or Telegram's result.json.
 */
export async function* streamJsonArray(chunks: AsyncIterable<Uint8Array>, path: string[] = []): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8");
  const stack: Frame[] = [];
  let inString = false;
  let escaped = false;
  let keyParts: string[] | null = null;
  let capturing = false;
  let captureDepth = 0;
  let captureParts: string[] = [];

  const atTarget = () => {
    if (stack.length !== path.length + 1 || !stack[path.length].array) return false;
    for (let j = 0; j < path.length; j++) if (stack[j].array || stack[j].key !== path[j]) return false;
    return true;
  };

  const feed = (text: string, out: unknown[]) => {
    let captureStart = 0;
    let keyStart = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) {
          inString = false;
          if (keyParts) {
            keyParts.push(text.slice(keyStart, i));
            stack[stack.length - 1].key = JSON.parse(`"${keyParts.join("")}"`);
            keyParts = null;
          }
        }
        continue;
      }
      if (c === QUOTE) {
        inString = true;
        const top = stack[stack.length - 1];
        if (!capturing && top && !top.array && top.expectKey && stack.length <= path.length) {
          keyParts = [];
          keyStart = i + 1;
        }
      } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
        if (!capturing && c === OPEN_OBJECT && atTarget()) {
          capturing = true;
          captureDepth = stack.length;
          captureParts = [];
          captureStart = i;
        }
        stack.push({ array: c === OPEN_ARRAY, key: null, expectKey: c === OPEN_OBJECT });
      } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
        stack.pop();
        if (capturing && stack.length === captureDepth) {
          captureParts.push(text.slice(captureStart, i + 1));
          out.push(JSON.parse(captureParts.join("")));
          capturing = false;
          captureParts = [];
        }
      } else if (c === COLON || c === COMMA) {
        const top = stack[stack.length - 1];
        if (top && !top.array) top.expectKey = c === COMMA;
      }
    }
    if (capturing) captureParts.push(text.slice(captureStart));
    if (keyParts) keyParts.push(text.slice(keyStart));
  };

  for await (const chunk of chunks) {
    const out: unknown[] = [];
    feed(decoder.decode(chunk, { stream: true }), out);
    yield* out;
  }
  const out: unknown[] = [];
  feed(decoder.decode(), out);
  yield* out;
}
