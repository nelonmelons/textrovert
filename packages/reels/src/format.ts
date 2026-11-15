const parts = (ts: number, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, ...options }).formatToParts(ts).map((p) => [p.type, p.value]));

const dayKey = (ts: number, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(ts);

/** "Oct 14 – Oct 30, 2026", "Dec 30, 2026 – Jan 2, 2027" or "Oct 14, 2026". */
export function formatRange(startTs: number, endTs: number, timeZone: string): string {
  const a = parts(startTs, timeZone, { month: "short", day: "numeric", year: "numeric" });
  const b = parts(endTs, timeZone, { month: "short", day: "numeric", year: "numeric" });
  if (dayKey(startTs, timeZone) === dayKey(endTs, timeZone)) return `${a.month} ${a.day}, ${a.year}`;
  if (a.year !== b.year) return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
  return `${a.month} ${a.day} – ${b.month} ${b.day}, ${b.year}`;
}

/** "Tue, Oct 14 · 8:12 PM", the way chat apps stamp a new stretch of messages. */
export function formatStamp(ts: number, timeZone: string): string {
  const p = parts(ts, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export function formatTime(ts: number, timeZone: string): string {
  const p = parts(ts, timeZone, { hour: "numeric", minute: "2-digit" });
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** "Dec" and "24" from "2026-12-24", read as a calendar day with no zone shift. */
export function planDay(date: string): { month: string; day: string } {
  const [y, m, d] = date.split("-").map(Number);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
  return { month, day: String(d) };
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
