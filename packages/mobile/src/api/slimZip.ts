/**
 * Repacks a picked zip without its photos, videos and voice notes before upload. Chat exports (an Instagram or
 * WhatsApp download especially) are mostly media the server never reads, and a multi-GB upload is slow on a phone
 * and too big for the server to unpack. Entries are copied still compressed, so this only moves bytes.
 */

// Media the parsers never open: they only read message text and the file names messages point at.
const MEDIA_RE = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?|mp4|mov|m4v|3gp|webm|avi|mkv|mp3|m4a|aac|wav|ogg|opus|amr|caf|pdf|srt)$/i;

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const COPY_CHUNK = 4 * 1024 * 1024;
const U32 = 0xffffffff;

export interface ZipSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

interface Kept {
  header: Uint8Array;
  localOffset: number;
  compressedSize: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u64 = (v: DataView, at: number) => v.getUint32(at, true) + v.getUint32(at + 4, true) * 2 ** 32;

/**
 * Writes a copy of the zip without media entries through write, and returns its size. Returns null, writing
 * nothing, when the source isn't a zip, has no media to drop, or the copy would need zip64.
 */
export async function slimZip(source: ZipSource, write: (bytes: Uint8Array) => Promise<void>): Promise<number | null> {
  const tailLength = Math.min(source.size, 65_557 + 20);
  const tail = await source.read(source.size - tailLength, tailLength);
  const t = view(tail);
  let eocd = -1;
  for (let i = tailLength - 22; i >= 0; i--) {
    if (t.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  let count = t.getUint16(eocd + 10, true);
  let directorySize = t.getUint32(eocd + 12, true);
  let directoryOffset = t.getUint32(eocd + 16, true);
  if (eocd >= 20 && t.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIG) {
    const record = view(await source.read(u64(t, eocd - 12), 56));
    if (record.getUint32(0, true) === ZIP64_EOCD_SIG) {
      count = u64(record, 32);
      directorySize = u64(record, 40);
      directoryOffset = u64(record, 48);
    }
  }
  const directory = await source.read(directoryOffset, directorySize);
  const d = view(directory);
  const kept: Kept[] = [];
  let dropped = 0;
  for (let i = 0, p = 0; i < count && p + 46 <= directory.length; i++) {
    if (d.getUint32(p, true) !== CENTRAL_SIG) return null;
    const nameLength = d.getUint16(p + 28, true);
    const extraLength = d.getUint16(p + 30, true);
    const commentLength = d.getUint16(p + 32, true);
    const name = new TextDecoder().decode(directory.subarray(p + 46, p + 46 + nameLength));
    const compressedSize = d.getUint32(p + 20, true);
    const size = d.getUint32(p + 24, true);
    const localOffset = d.getUint32(p + 42, true);
    const header = directory.slice(p, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (MEDIA_RE.test(name) || name.endsWith('/')) {
      dropped++;
      continue;
    }
    // Sizes or offsets past 4 GB live in a zip64 extra field this copy doesn't write.
    if (compressedSize === U32 || size === U32 || localOffset === U32) return null;
    kept.push({ header, localOffset, compressedSize });
  }
  if (dropped === 0 || kept.length === 0 || kept.length > 0xffff) return null;

  let written = 0;
  const out = async (bytes: Uint8Array) => {
    await write(bytes);
    written += bytes.byteLength;
  };
  const central: Uint8Array[] = [];
  for (const entry of kept) {
    const original = view(await source.read(entry.localOffset, 30));
    if (original.getUint32(0, true) !== LOCAL_SIG) return null;
    const dataStart = entry.localOffset + 30 + original.getUint16(26, true) + original.getUint16(28, true);
    const h = view(entry.header);
    const nameLength = h.getUint16(28, true);
    const local = new Uint8Array(30 + nameLength);
    const l = view(local);
    l.setUint32(0, LOCAL_SIG, true);
    l.setUint16(4, h.getUint16(6, true), true);
    // No data descriptor: the sizes and CRC come from the central directory instead.
    l.setUint16(6, h.getUint16(8, true) & ~0x8, true);
    for (const [to, from] of [[8, 10], [10, 12], [12, 14]]) l.setUint16(to, h.getUint16(from, true), true);
    for (const [to, from] of [[14, 16], [18, 20], [22, 24]]) l.setUint32(to, h.getUint32(from, true), true);
    l.setUint16(26, nameLength, true);
    local.set(entry.header.subarray(46), 30);
    const offset = written;
    if (offset > U32) return null;
    await out(local);
    for (let done = 0; done < entry.compressedSize; ) {
      const chunk = await source.read(dataStart + done, Math.min(COPY_CHUNK, entry.compressedSize - done));
      if (chunk.byteLength === 0) return null;
      await out(chunk);
      done += chunk.byteLength;
    }
    const record = entry.header.slice();
    const r = view(record);
    r.setUint16(8, h.getUint16(8, true) & ~0x8, true);
    r.setUint16(30, 0, true);
    r.setUint16(32, 0, true);
    r.setUint32(42, offset, true);
    central.push(record);
  }
  const centralOffset = written;
  for (const record of central) await out(record);
  if (written > U32) return null;
  const end = new Uint8Array(22);
  const e = view(end);
  e.setUint32(0, EOCD_SIG, true);
  e.setUint16(8, kept.length, true);
  e.setUint16(10, kept.length, true);
  e.setUint32(12, written - centralOffset, true);
  e.setUint32(16, centralOffset, true);
  await out(end);
  return written;
}
