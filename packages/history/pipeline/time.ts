const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Days since 1970-01-01 in local time; consecutive days differ by 1. */
  dayIndex: number;
}

/** The team is in San Francisco, so a missing or unknown zone means Pacific time rather than the server's UTC. */
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Local-time math for one IANA zone, caching the UTC offset per hour so millions of messages stay cheap. */
export class LocalTime {
  private readonly offsets = new Map<number, number>();
  private readonly format: Intl.DateTimeFormat;

  constructor(readonly timeZone: string) {
    this.format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  }

  offsetMs(ts: number): number {
    const hour = Math.floor(ts / HOUR_MS);
    let offset = this.offsets.get(hour);
    if (offset === undefined) {
      const at = hour * HOUR_MS;
      const p: Record<string, number> = {};
      for (const part of this.format.formatToParts(at)) {
        if (part.type !== "literal") p[part.type] = Number(part.value);
      }
      offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
      this.offsets.set(hour, offset);
    }
    return offset;
  }

  parts(ts: number): LocalParts {
    const local = ts + this.offsetMs(ts);
    const d = new Date(local);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      weekday: d.getUTCDay(),
      dayIndex: Math.floor(local / DAY_MS),
    };
  }

  /** Wall-clock time in this zone to epoch ms. Month is 1-12. */
  fromLocal(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    const guess = wall - this.offsetMs(wall);
    return wall - this.offsetMs(guess);
  }
}
