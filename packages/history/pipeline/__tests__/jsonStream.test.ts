import { describe, expect, it } from "vitest";

import { streamJsonArray } from "../jsonStream";

async function collect(json: string, path: string[], chunkSize: number) {
  const bytes = new TextEncoder().encode(json);
  async function* chunks() {
    for (let i = 0; i < bytes.length; i += chunkSize) yield bytes.subarray(i, i + chunkSize);
  }
  const out: unknown[] = [];
  for await (const item of streamJsonArray(chunks(), path)) out.push(item);
  return out;
}

describe("streamJsonArray", () => {
  const items = [
    { title: 'tricky "quotes" and \\ backslashes', parts: ["}", "]", "{", "["] },
    { title: "emoji 😂 and accents é", nested: { a: [1, 2, { b: "c" }] } },
    { title: "", empty: {} },
  ];

  it.each([1, 2, 3, 7, 4096])("yields root array elements with %i-byte chunks", async (size) => {
    expect(await collect(JSON.stringify(items), [], size)).toEqual(items);
  });

  it("yields elements at a nested key path and ignores look-alike keys", async () => {
    const doc = {
      about: "x",
      list: [{ wrong: true }],
      chats: { about: "y", decoy: { list: [{ wrong: true }] }, list: items },
      left_chats: { list: [{ wrong: true }] },
    };
    expect(await collect(JSON.stringify(doc, null, 2), ["chats", "list"], 5)).toEqual(items);
  });

  it("handles escaped keys", async () => {
    expect(await collect('{"a\\"b": [{"x":1}], "messages": [{"y":2}]}', ["messages"], 3)).toEqual([{ y: 2 }]);
  });
});
