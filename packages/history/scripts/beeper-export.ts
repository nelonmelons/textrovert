/**
 * Imports every chat from Beeper Desktop into Textrovert, on demand. Beeper must be running on this computer with its
 * Desktop API enabled (Settings → Integrations); create an access token there.
 *
 *   BEEPER_ACCESS_TOKEN=... pnpm beeper-export                       # writes beeper-export.zip to upload from the app
 *   BEEPER_ACCESS_TOKEN=... CONVEX_URL=https://<deployment>.convex.cloud OWNER_KEY=... pnpm beeper-export --upload
 *
 * Only what Beeper has synced is available: right after connecting an account that may be just recent history.
 */
import { writeFile } from "node:fs/promises";

import BeeperDesktop from "@beeper/desktop-api";
import { ConvexHttpClient } from "convex/browser";
import { strToU8, zipSync } from "fflate";

import { api } from "../convex/_generated/api";
import { BEEPER_FORMAT, beeperPlatform, type BeeperChatFile } from "../pipeline/parsers/beeper";

const OUT = "beeper-export.zip";
const beeper = new BeeperDesktop();
const files: Record<string, Uint8Array> = {};
let chats = 0;
let messages = 0;

for await (const chat of beeper.chats.list()) {
  const file: BeeperChatFile = {
    format: BEEPER_FORMAT,
    platform: beeperPlatform(chat.network),
    chat: {
      id: chat.id,
      title: chat.title,
      type: chat.type,
      network: chat.network,
      participants: chat.participants.items.map((p) => ({
        id: p.id,
        name: p.fullName || p.username || p.phoneNumber || p.email || p.id,
        isSelf: !!p.isSelf,
      })),
    },
    messages: [],
  };
  for await (const m of beeper.messages.list(chat.id)) {
    file.messages.push({
      id: m.id,
      senderID: m.senderID,
      senderName: m.senderName ?? null,
      isSender: !!m.isSender,
      timestamp: m.timestamp,
      text: m.text ?? null,
      type: m.type ?? null,
      attachments: (m.attachments ?? []).map((a) => ({ type: a.type, isGif: a.isGif, isSticker: a.isSticker, isVoiceNote: a.isVoiceNote, duration: a.duration })),
      isDeleted: !!m.isDeleted,
      edited: !!m.editedTimestamp,
      reactions: (m.reactions ?? []).map((r) => ({ participantID: r.participantID, reactionKey: r.reactionKey })),
    });
  }
  if (file.messages.length === 0) continue;
  files["beeper/" + chats + ".json"] = strToU8(JSON.stringify(file));
  chats++;
  messages += file.messages.length;
  process.stdout.write(`\r${chats} chats, ${messages} messages`);
}
process.stdout.write("\n");
const zip = zipSync(files);

if (!process.argv.includes("--upload")) {
  await writeFile(OUT, zip);
  console.log("Wrote " + OUT + "; upload it from the app like any other export.");
} else {
  const url = process.env.CONVEX_URL;
  const ownerKey = process.env.OWNER_KEY;
  if (!url || !ownerKey) throw new Error("--upload needs CONVEX_URL and OWNER_KEY");
  const convex = new ConvexHttpClient(url);
  const uploadUrl = await convex.mutation(api.uploads.generateUploadUrl, { ownerKey });
  const res = await fetch(uploadUrl, { method: "POST", headers: { "content-type": "application/zip" }, body: zip });
  if (!res.ok) throw new Error("Upload failed: HTTP " + res.status);
  const { storageId } = (await res.json()) as { storageId: string };
  const uploadId = await convex.mutation(api.uploads.start, {
    ownerKey,
    storageId: storageId as never,
    fileName: "Beeper.zip",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  console.log("Uploaded; processing as upload " + uploadId);
}
