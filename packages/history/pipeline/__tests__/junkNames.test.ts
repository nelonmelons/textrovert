import { describe, expect, it } from "vitest";
import { isJunkName, listPeople } from "../assistant/requests";

describe("isJunkName", () => {
  it("drops pieces of read receipts and timestamps that old exports stored as people", () => {
    for (const name of ["you after 2 minutes)", "You after 5 seconds", "Mia after 1 hour", "May 17, 2024  5:35:00 PM (Read", "(Read by you after 3 seconds)", "Read by Sam", "", "  "])
      expect(isJunkName(name), name).toBe(true);
  });
  it("keeps real names, handles and numbers", () => {
    for (const name of ["Mia Chen", "Sam", "+1 (415) 555-0123", "mia@example.com", "Afterglow Club", "May", "Yousef", "Read Jackson"]) expect(isJunkName(name), name).toBe(false);
  });
  it("listPeople leaves them out", () => {
    const ref = (key: string, participants: string[]) => ({ key, title: "", kind: "group" as const, participants, selfName: "Me", messageCount: 10, lastAt: 1 });
    expect(listPeople([ref("a", ["Me", "Mia Chen", "you after 2 minutes)", "May 17, 2024  5:35:00 PM (Read"])] as never).map((p) => p.name)).toEqual(["Mia Chen"]);
  });
});
