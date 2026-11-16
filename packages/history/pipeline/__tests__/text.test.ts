import { describe, expect, it } from "vitest";

import { emojis, fixMojibake, words } from "../text";

describe("emojis", () => {
  it("counts text- and emoji-style variants as one, in the form that renders in color", () => {
    expect(emojis("love ❤ and ❤️ and ❤️‍🔥")).toEqual(["❤️", "❤️", "❤️‍🔥"]);
    expect(emojis("👍🏽 ☝🏽 ✨ 😂")).toEqual(["👍🏽", "☝🏽", "✨", "😂"]);
  });
});

describe("fixMojibake", () => {
  it("re-decodes Meta's byte-per-character strings, including 4-byte emoji, and leaves real Latin-1 alone", () => {
    const encode = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
    expect(fixMojibake(encode("Café 😂🍕"))).toBe("Café 😂🍕");
    expect(fixMojibake("Café")).toBe("Café");
  });
});

describe("words", () => {
  it("drops URLs and lowercases", () => {
    expect(words("Look https://x.com/a Ok I'm IN")).toEqual(["look", "ok", "i'm", "in"]);
  });
});
