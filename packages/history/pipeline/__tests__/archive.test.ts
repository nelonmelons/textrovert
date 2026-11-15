import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";

import { materialize, openArchive, readHead, readLines, readText } from "../archive";

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function tempFile(name: string, bytes: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), "archive-test-"));
  dirs.push(dir);
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

describe("openArchive", () => {
  it("reads stored and deflated entries, nested zips, and skips macOS junk", async () => {
    const inner = zipSync({ "_chat.txt": strToU8("[1/15/24, 9:41:05 PM] Sam: hi\n") });
    const big = "line\n".repeat(50_000);
    const zip = zipSync({
      "messages/inbox/sam_1/message_1.json": [strToU8('{"participants":[]}'), { level: 0 }],
      "messages/big.txt": [strToU8(big), { level: 9 }],
      "WhatsApp Chat - Sam.zip": [inner, { level: 0 }],
      "__MACOSX/._message_1.json": strToU8("junk"),
      "photos/émoji 😂.jpg": new Uint8Array([1, 2, 3]),
    });
    const archive = await openArchive(await tempFile("export.zip", zip), "export.zip");
    try {
      expect(archive.entries.map((e) => e.path).sort()).toEqual([
        "WhatsApp Chat - Sam.zip/_chat.txt",
        "messages/big.txt",
        "messages/inbox/sam_1/message_1.json",
        "photos/émoji 😂.jpg",
      ]);
      const byPath = new Map(archive.entries.map((e) => [e.path, e]));
      expect(await readText(byPath.get("messages/inbox/sam_1/message_1.json")!)).toBe('{"participants":[]}');
      expect(await readText(byPath.get("messages/big.txt")!)).toBe(big);
      expect(await readHead(byPath.get("messages/big.txt")!, 10)).toBe("line\nline\n");
      let lines = 0;
      for await (const line of readLines(byPath.get("messages/big.txt")!)) if (line === "line") lines++;
      expect(lines).toBe(50_000);
      expect(await readText(byPath.get("WhatsApp Chat - Sam.zip/_chat.txt")!)).toContain("Sam: hi");
      const local = await materialize(byPath.get("photos/émoji 😂.jpg")!);
      await local.cleanup();
    } finally {
      await archive.close();
    }
  });

  it("treats a non-zip upload as a single entry", async () => {
    const path = await tempFile("chat.txt", strToU8("hello"));
    const archive = await openArchive(path, "WhatsApp Chat with Sam.txt");
    expect(archive.entries.map((e) => [e.path, e.size, e.filePath])).toEqual([["WhatsApp Chat with Sam.txt", 5, path]]);
    expect(await readText(archive.entries[0])).toBe("hello");
  });
});
