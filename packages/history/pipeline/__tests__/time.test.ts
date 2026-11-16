import { describe, expect, it } from "vitest";

import { LocalTime, safeTimeZone } from "../time";

describe("safeTimeZone", () => {
  it("falls back to Pacific time when the app sends no zone or one the runtime doesn't know", () => {
    expect(safeTimeZone(undefined)).toBe("America/Los_Angeles");
    expect(safeTimeZone("")).toBe("America/Los_Angeles");
    expect(safeTimeZone("Mars/Olympus_Mons")).toBe("America/Los_Angeles");
    expect(safeTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("puts an 8:30 PM message in San Francisco on that evening, not the next UTC morning", () => {
    const sent = Date.UTC(2026, 10, 15, 4, 30);
    const { month, day, hour } = new LocalTime(safeTimeZone(null)).parts(sent);
    expect([month, day, hour]).toEqual([11, 14, 20]);
  });
});
