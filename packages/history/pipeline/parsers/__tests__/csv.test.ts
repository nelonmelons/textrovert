import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { csvParser } from "../csv";

describe("csv", () => {
  it("claims chat CSVs with time, sender and text columns and rejects look-alikes", async () => {
    const run = await runParser(csvParser, {
      "chat.csv": "timestamp,sender,message\n2024-01-01T00:00:00Z,a,hi",
      "nested/export.zip/Export.CSV": "\ufeffDate;From;Body\n2024-01-01;a;hi",
      "discord/messages/c123/messages.csv": "ID,Timestamp,Contents,Attachments\n1,2024-01-01 00:00:00.000000+00:00,hi,",
      "contacts.csv": "name,phone,email\nSam,555,s@example.com",
      "sales.csv": "date,amount,customer\n2024-01-01,5,x",
      "no-time.csv": "sender,message\na,hi",
      "notes.txt": "timestamp,sender,message",
      "chat.json": "[]",
    });
    expect(run.claimed).toEqual(["chat.csv", "nested/export.zip/Export.CSV"]);
  });

  it("parses RFC 4180 quoting, multi-line fields and a conversation column", async () => {
    const csv = [
      "Timestamp,Sender,Message,Chat",
      '2024-03-05T10:00:00Z,Ann,"hello, world",Family',
      '2024-03-05T10:01:00Z,Bob,"line one',
      'line ""two""",Family',
      "2024-03-05T10:02:00Z,Ann,hi,Work",
      "2024-03-05T10:03:00Z,Cat,yo,Work",
      "2024-03-05T10:04:00Z,Dan,sup,Work",
      "",
    ].join("\r\n");
    const run = await runParser(csvParser, { "export.csv": csv });

    expect([...run.conversations.keys()]).toEqual(["Family", "Work"]);
    expect(run.conversations.get("Family")).toMatchObject({ title: "Family", kind: "dm", participants: ["Ann", "Bob"] });
    expect(run.conversations.get("Work")).toMatchObject({ kind: "group", participants: ["Ann", "Cat", "Dan"] });
    expect(run.messages.get("Family")).toEqual([
      { ts: Date.UTC(2024, 2, 5, 10, 0), sender: "Ann", kind: "text", text: "hello, world" },
      { ts: Date.UTC(2024, 2, 5, 10, 1), sender: "Bob", kind: "text", text: 'line one\nline "two"' },
    ]);
  });

  it("names a conversation after the file when there is no conversation column", async () => {
    const run = await runParser(csvParser, { "exports/Dinner Plans.csv": "time,from,text\n1700000000,Ann,hi\n1700000060123,Bob,hey" });
    const [conversation] = [...run.conversations.values()];
    expect(conversation).toMatchObject({ externalId: "Dinner Plans", title: "Dinner Plans", kind: "dm", participants: ["Ann", "Bob"] });
    expect(run.messages.get("Dinner Plans")!.map((m) => m.ts)).toEqual([1_700_000_000_000, 1_700_000_060_123]);
  });

  it("handles ISO with and without zones, offsets and US dates in the user's time zone", async () => {
    const csv = [
      "created_at,author,content",
      "2024-01-02T03:04:05,a,naive iso",
      "2024-01-02 03:04:05,a,space iso",
      "2024-01-02T03:04:05+02:00,a,offset iso",
      "2024-01-02T03:04:05.250Z,a,utc iso",
      "1/2/2024 9:05 PM,a,us pm",
      "1/2/2024 12:30 AM,a,us midnight",
      "13/2/2024 8:00,a,day first",
      "garbage,a,bad time",
      "2024-01-02T03:04:05Z,a,",
    ].join("\n");
    const run = await runParser(csvParser, { "t.csv": csv }, { timeZone: "America/Los_Angeles" });
    const ts = run.messages.get("t")!.map((m) => m.ts);
    expect(ts).toEqual([
      Date.UTC(2024, 0, 2, 11, 4, 5),
      Date.UTC(2024, 0, 2, 11, 4, 5),
      Date.UTC(2024, 0, 2, 1, 4, 5),
      Date.UTC(2024, 0, 2, 3, 4, 5),
      Date.UTC(2024, 0, 3, 5, 5),
      Date.UTC(2024, 0, 2, 8, 30),
      Date.UTC(2024, 1, 13, 16, 0),
    ]);
    expect(run.warnings).toEqual(["t.csv: skipped 2 rows with an unreadable time or no text"]);
  });

  it("combines separate date and time columns and strips invisible marks", async () => {
    const csv = 'Date,Time,Name,Text\n2024-05-06,07:08:09,"\u200eAnn","\u200ehi \u{1F600}"\n';
    const run = await runParser(csvParser, { "dt.csv": csv });
    expect(run.messages.get("dt")).toEqual([{ ts: Date.UTC(2024, 4, 6, 7, 8, 9), sender: "Ann", kind: "text", text: "hi \u{1F600}" }]);
  });

  it("merges rows of the same conversation across files and batches large files", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => `${1_700_000_000 + i},Ann,m${i}`).join("\n");
    const run = await runParser(csvParser, {
      "a.csv": "timestamp,sender,message,conversation\n1700000000,Ann,one,Room\n",
      "b.csv": "timestamp,sender,message,conversation\n1700000001,Bob,two,Room\n",
      "big.csv": "timestamp,sender,message\n" + rows,
    });
    expect(run.messages.get("Room")!.map((m) => m.text)).toEqual(["one", "two"]);
    expect(run.conversations.get("Room")!.participants).toEqual(["Ann", "Bob"]);
    expect(run.messages.get("big")).toHaveLength(2500);
  });
});
