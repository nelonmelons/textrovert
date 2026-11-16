import { readLines } from "../archive";
import type { ArchiveEntry, MessageInput, Parser, ParserIO } from "../types";

const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const TIME_COLUMNS = ["timestamp", "datetime", "date_time", "sent_at", "created_at", "date", "time"];
const SENDER_COLUMNS = ["sender", "sender_name", "from", "author", "user", "name"];
const TEXT_COLUMNS = ["message", "text", "content", "contents", "body"];
const CONVERSATION_COLUMNS = ["conversation", "conversation_id", "chat", "chat_name", "thread", "channel"];
const DATE_ONLY_RE = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/;
const EPOCH_RE = /^\d{9,}(?:\.\d+)?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?m\.?)?)?$/i;

interface Columns {
  delimiter: string;
  time: number;
  clock: number | null;
  sender: number;
  text: number;
  conversation: number | null;
}

interface Group {
  senders: Set<string>;
  batch: MessageInput[];
}

export const csvParser: Parser = {
  platform: "csv",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.csv$/i.test(entry.path)) continue;
      const firstLine = (await peek(entry)).split(/\r?\n/)[0] ?? "";
      if (findColumns(firstLine)) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) await parseFile(entry, io);
  },
};

function pick(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function findColumns(headerLine: string): Columns | null {
  const delimiter = [",", ";", "\t"].reduce((best, d) => (headerLine.split(d).length > headerLine.split(best).length ? d : best), ",");
  const header = splitRecord(headerLine, delimiter).map((name) => name.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const time = pick(header, TIME_COLUMNS);
  const sender = pick(header, SENDER_COLUMNS);
  const text = pick(header, TEXT_COLUMNS);
  if (time < 0 || sender < 0 || text < 0) return null;
  const clock = header[time] === "date" ? header.indexOf("time") : -1;
  const conversation = pick(header, CONVERSATION_COLUMNS);
  return { delimiter, time, clock: clock >= 0 ? clock : null, sender, text, conversation: conversation >= 0 ? conversation : null };
}

function splitRecord(record: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < record.length; i++) {
    const c = record[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (record[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields;
}

/** RFC 4180 records from a stream of lines: a record continues on the next line while a quoted field is open. */
async function* records(lines: AsyncIterable<string>, delimiter: string): AsyncGenerator<string[]> {
  let pending: string | null = null;
  for await (const line of lines) {
    const joined: string = pending === null ? line : pending + "\n" + line;
    if (((joined.match(/"/g) ?? []).length & 1) === 1) {
      pending = joined;
      continue;
    }
    pending = null;
    if (joined !== "") yield splitRecord(joined, delimiter);
  }
  if (pending !== null) yield splitRecord(pending, delimiter);
}

async function parseFile(entry: ArchiveEntry, io: ParserIO) {
  const lines = readLines(entry);
  const headerLine = await lines.next();
  const columns = headerLine.done ? null : findColumns(headerLine.value);
  if (!columns) {
    io.warn(entry.path + ": CSV header needs a time, sender and text column");
    return;
  }
  const fileName = (entry.path.split("/").pop() ?? entry.path).replace(/\.csv$/i, "");
  const groups = new Map<string, Group>();
  let skipped = 0;

  const flush = async (id: string, group: Group) => {
    io.conversation({ externalId: id, title: id, kind: group.senders.size <= 2 ? "dm" : "group", participants: [...group.senders] });
    if (group.batch.length) await io.messages(id, group.batch.splice(0));
  };

  for await (const row of records(lines, columns.delimiter)) {
    const sender = clean(row[columns.sender] ?? "");
    const text = clean(row[columns.text] ?? "");
    const ts = parseTime(row[columns.time] ?? "", columns.clock === null ? "" : row[columns.clock] ?? "", io);
    if (ts === null || !text) {
      skipped++;
      continue;
    }
    const id = (columns.conversation === null ? "" : clean(row[columns.conversation] ?? "")) || fileName;
    let group = groups.get(id);
    if (!group) {
      group = { senders: new Set(), batch: [] };
      groups.set(id, group);
    }
    if (sender) group.senders.add(sender);
    group.batch.push({ ts, sender, kind: sender ? "text" : "system", text });
    if (group.batch.length >= 1000) await flush(id, group);
  }
  for (const [id, group] of groups) await flush(id, group);
  if (skipped) io.warn(entry.path + ": skipped " + skipped + " rows with an unreadable time or no text");
}

function clean(value: string): string {
  return value.replace(INVISIBLE_RE, "").trim();
}

function parseTime(value: string, clock: string, io: ParserIO): number | null {
  let v = value.replace(/[\s\u202f\u00a0]+/g, " ").trim();
  if (EPOCH_RE.test(v)) {
    const n = Number(v);
    return Math.round(n > 1e11 ? n : n * 1000);
  }
  if (clock && DATE_ONLY_RE.test(v)) v += " " + clock.replace(/[\s\u202f\u00a0]+/g, " ").trim();

  const iso = ISO_RE.exec(v);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const [hour, minute, second] = [Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0)];
    const zone = iso[7];
    if (!zone) return io.fromLocal(year, month, day, hour, minute, second);
    const offset = zone.toUpperCase() === "Z" ? 0 : offsetMinutes(zone);
    return Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000;
  }

  const us = US_RE.exec(v);
  if (!us) return null;
  const [a, b] = [Number(us[1]), Number(us[2])];
  const [month, day] = a > 12 ? [b, a] : [a, b];
  let year = Number(us[3]);
  if (year < 100) year += 2000;
  let hour = Number(us[4] ?? 0);
  const meridiem = us[7]?.toLowerCase();
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return io.fromLocal(year, month, day, hour, Number(us[5] ?? 0), Number(us[6] ?? 0));
}

function offsetMinutes(zone: string): number {
  const digits = zone.slice(1).replace(":", "");
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0);
  return zone[0] === "-" ? -minutes : minutes;
}
