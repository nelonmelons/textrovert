import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";

import type { Archive, ArchiveEntry } from "./types";

export const MAX_TEXT_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_NESTED_ZIP_BYTES = 1024 ** 3;
const IGNORED_ENTRY_RE = /(^|\/)(__MACOSX\/|\.DS_Store$|\._)/;

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;

interface ZipRecord {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  encrypted: boolean;
}

/** Opens an uploaded file: a zip (nested zips included) or a single plain file. Reads only what parsers ask for. */
export async function openArchive(filePath: string, name: string): Promise<Archive> {
  const tempDirs: string[] = [];
  const close = () => Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))).then(() => {});
  try {
    const entries = (await isZip(filePath))
      ? await expandZip(filePath, "", 0, tempDirs)
      : [{ path: name, size: (await stat(filePath)).size, filePath, open: () => createReadStream(filePath) }];
    return { name, entries, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function isZip(filePath: string): Promise<boolean> {
  const fh = await open(filePath, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await fh.read(head, 0, 4, 0);
    return bytesRead === 4 && head[0] === 0x50 && head[1] === 0x4b && [3, 5, 7].includes(head[2]);
  } finally {
    await fh.close();
  }
}

async function expandZip(filePath: string, prefix: string, depth: number, tempDirs: string[]): Promise<ArchiveEntry[]> {
  const out: ArchiveEntry[] = [];
  for (const record of await readCentralDirectory(filePath)) {
    if (record.encrypted || IGNORED_ENTRY_RE.test(record.name)) continue;
    const entry: ArchiveEntry = {
      path: prefix + record.name,
      size: record.size,
      open: () => openZipEntry(filePath, record),
    };
    if (depth < 2 && /\.zip$/i.test(record.name) && record.size <= MAX_NESTED_ZIP_BYTES) {
      const dir = await mkdtemp(join(tmpdir(), "chat-export-"));
      tempDirs.push(dir);
      const nested = join(dir, basename(record.name));
      await pipeline(Readable.from(entry.open()), createWriteStream(nested));
      if (await isZip(nested)) {
        out.push(...(await expandZip(nested, entry.path + "/", depth + 1, tempDirs)));
        continue;
      }
    }
    out.push(entry);
  }
  return out;
}

async function readCentralDirectory(filePath: string): Promise<ZipRecord[]> {
  const fh = await open(filePath, "r");
  try {
    const { size } = await fh.stat();
    const tailLength = Math.min(size, 65_557 + 20);
    const tail = Buffer.alloc(tailLength);
    await fh.read(tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("This zip file is damaged or incomplete (no central directory found).");
    let count = tail.readUInt16LE(eocd + 10);
    let directorySize = tail.readUInt32LE(eocd + 12);
    let directoryOffset = tail.readUInt32LE(eocd + 16);
    const locator = eocd - 20;
    if (locator >= 0 && tail.readUInt32LE(locator) === ZIP64_LOCATOR_SIG) {
      const record = Buffer.alloc(56);
      await fh.read(record, 0, 56, Number(tail.readBigUInt64LE(locator + 8)));
      if (record.readUInt32LE(0) === ZIP64_EOCD_SIG) {
        count = Number(record.readBigUInt64LE(32));
        directorySize = Number(record.readBigUInt64LE(40));
        directoryOffset = Number(record.readBigUInt64LE(48));
      }
    }
    const directory = Buffer.alloc(directorySize);
    await fh.read(directory, 0, directorySize, directoryOffset);
    const records: ZipRecord[] = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= directory.length; i++) {
      if (directory.readUInt32LE(p) !== CENTRAL_SIG) throw new Error("This zip file's central directory is corrupt.");
      const flags = directory.readUInt16LE(p + 8);
      const method = directory.readUInt16LE(p + 10);
      let compressedSize = directory.readUInt32LE(p + 20);
      let uncompressedSize = directory.readUInt32LE(p + 24);
      const nameLength = directory.readUInt16LE(p + 28);
      const extraLength = directory.readUInt16LE(p + 30);
      const commentLength = directory.readUInt16LE(p + 32);
      let localOffset = directory.readUInt32LE(p + 42);
      const name = decodeName(directory.subarray(p + 46, p + 46 + nameLength), (flags & 0x800) !== 0);
      let e = p + 46 + nameLength;
      const extraEnd = e + extraLength;
      while (e + 4 <= extraEnd) {
        const id = directory.readUInt16LE(e);
        const length = directory.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(directory.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(directory.readBigUInt64LE(q));
            q += 8;
          }
          if (localOffset === 0xffffffff) localOffset = Number(directory.readBigUInt64LE(q));
        }
        e += 4 + length;
      }
      p = extraEnd + commentLength;
      if (name.endsWith("/")) continue;
      records.push({
        name: name.replace(/\\/g, "/"),
        method,
        compressedSize,
        size: uncompressedSize,
        localOffset,
        encrypted: (flags & 1) !== 0,
      });
    }
    return records;
  } finally {
    await fh.close();
  }
}

function decodeName(bytes: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return bytes.toString("utf8");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes.toString("latin1");
  }
}

async function* openZipEntry(filePath: string, record: ZipRecord): AsyncGenerator<Uint8Array> {
  const fh = await open(filePath, "r");
  let start: number;
  try {
    const header = Buffer.alloc(30);
    await fh.read(header, 0, 30, record.localOffset);
    if (header.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`Corrupt zip entry: ${record.name}`);
    start = record.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await fh.close();
  }
  if (record.compressedSize === 0) return;
  const raw = createReadStream(filePath, { start, end: start + record.compressedSize - 1 });
  if (record.method === 0) {
    yield* raw;
    return;
  }
  if (record.method !== 8) {
    raw.destroy();
    throw new Error(`Unsupported zip compression (method ${record.method}) for ${record.name}`);
  }
  const inflate = createInflateRaw();
  raw.on("error", (error) => inflate.destroy(error));
  raw.pipe(inflate);
  try {
    yield* inflate;
  } finally {
    raw.destroy();
    inflate.destroy();
  }
}

export class EntryTooLargeError extends Error {
  constructor(path: string, bytes: number) {
    super(`${path} is ${Math.round(bytes / 1048576)} MB, too large to load in one piece`);
  }
}

export async function readBytes(entry: ArchiveEntry, maxBytes = MAX_TEXT_ENTRY_BYTES): Promise<Uint8Array> {
  if (entry.size > maxBytes) throw new EntryTooLargeError(entry.path, entry.size);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of entry.open()) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new EntryTooLargeError(entry.path, total);
    chunks.push(chunk);
  }
  return concat(chunks, total);
}

export async function readText(entry: ArchiveEntry, maxBytes?: number): Promise<string> {
  return decodeText(await readBytes(entry, maxBytes));
}

export async function readJson(entry: ArchiveEntry, maxBytes?: number): Promise<unknown> {
  return JSON.parse(await readText(entry, maxBytes));
}

export async function readHead(entry: ArchiveEntry, maxBytes = 4096): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of entry.open()) {
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) break;
  }
  return decodeText(concat(chunks, total).subarray(0, maxBytes));
}

/** Streams lines (without line endings) from a UTF-8 text entry. */
export async function* readLines(entry: ArchiveEntry): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  let rest = "";
  for await (const chunk of entry.open()) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split(/\r?\n/);
    rest = lines.pop() ?? "";
    yield* lines;
  }
  rest += decoder.decode();
  if (rest) yield rest;
}

/** Path of the entry on local disk, extracting it to a temp file when it lives inside a zip. */
export async function materialize(entry: ArchiveEntry): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (entry.filePath) return { path: entry.filePath, cleanup: async () => {} };
  const dir = await mkdtemp(join(tmpdir(), "chat-entry-"));
  const path = join(dir, basename(entry.path) || "entry");
  await pipeline(Readable.from(entry.open()), createWriteStream(path));
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes);
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** In-memory archive for tests and scripts. Streams in small chunks to exercise chunk boundaries. */
export function memoryArchive(files: Record<string, string | Uint8Array>, name = "upload.zip", chunkSize = 4096): Archive {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([path, content]): ArchiveEntry => {
    const bytes = typeof content === "string" ? encoder.encode(content) : content;
    return {
      path,
      size: bytes.byteLength,
      async *open() {
        for (let i = 0; i < bytes.byteLength; i += chunkSize) yield bytes.subarray(i, i + chunkSize);
      },
    };
  });
  return { name, entries, close: async () => {} };
}
