// Calendar arithmetic in an IANA time zone, matching Foundation's Gregorian Calendar:
// whole local days, wall-clock day addition, and elapsed time measured in real seconds.

const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/** Local wall-clock fields of an instant (epoch ms) in a time zone. */
export function wallTime(ms: number, timeZone: string): WallTime {
  const p: Record<string, string> = {};
  for (const part of wallFormatter(timeZone).formatToParts(ms)) p[part.type] = part.value;
  const year = Number(p.year);
  return {
    year: p.era === "BC" || p.era === "B" ? 1 - year : year,
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    millisecond: ((ms % 1000) + 1000) % 1000,
  };
}

function wallAsUTC(w: WallTime): number {
  const d = new Date(0);
  d.setUTCFullYear(w.year, w.month - 1, w.day);
  d.setUTCHours(w.hour, w.minute, w.second, w.millisecond);
  return d.getTime();
}

/** Offset of the zone from UTC at an instant, in ms. */
export function zoneOffset(ms: number, timeZone: string): number {
  return wallAsUTC(wallTime(ms, timeZone)) - ms;
}

/**
 * The instant a local wall-clock time names. Day, hour and minute overflow roll over like Date.UTC.
 * An ambiguous time (clocks fell back) resolves to the earlier instant; a skipped time (clocks sprang forward)
 * moves forward by the length of the gap, as Foundation does.
 */
export function fromWallTime(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const wall = wallAsUTC({ year, month, day, hour, minute, second, millisecond });
  const normalized = wallTime(wall, "UTC");
  const before = wall - zoneOffset(wall - DAY, timeZone);
  const after = wall - zoneOffset(wall + DAY, timeZone);
  const valid = [before, after].filter((t) => sameWall(wallTime(t, timeZone), normalized));
  if (valid.length > 0) return Math.min(...valid);
  return before;
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

/** The first instant of the local day containing `ms`. */
export function startOfDay(ms: number, timeZone: string): number {
  const w = wallTime(ms, timeZone);
  return fromWallTime(timeZone, w.year, w.month, w.day);
}

/** Adds whole local days, keeping the wall-clock time (Calendar.date(byAdding: .day, ...)). */
export function addDays(ms: number, days: number, timeZone: string): number {
  const w = wallTime(ms, timeZone);
  return fromWallTime(timeZone, w.year, w.month, w.day + days, w.hour, w.minute, w.second, w.millisecond);
}

/** Whole local days from `a` to `b` (Calendar.dateComponents([.day], from:to:).day). */
export function dayDifference(a: number, b: number, timeZone: string): number {
  const wa = a + zoneOffset(a, timeZone);
  const wb = b + zoneOffset(b, timeZone);
  let n = Math.trunc((wb - wa) / DAY);
  if (b >= a) {
    while (addDays(a, n + 1, timeZone) <= b) n++;
    while (n > 0 && addDays(a, n, timeZone) > b) n--;
  } else {
    while (addDays(a, n - 1, timeZone) >= b) n--;
    while (n < 0 && addDays(a, n, timeZone) < b) n++;
  }
  return n;
}

/** A valid IANA zone, or this runtime's zone when the identifier is unknown (TimeZone(identifier:) ?? .current). */
export function safeTimeZone(identifier: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: identifier });
    return identifier;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

export const MINUTE_MS = MINUTE;
export const DAY_MS = DAY;
