/**
 * A made-up Instagram "Download your information" export in both formats Instagram offers, laid out like the real
 * thing: your_instagram_activity/messages/inbox/<name_id>/message_N.(json|html), photos beside them, and
 * personal_information naming the account owner. Every person and message here is invented.
 */

export const OWNER = { name: "Maya Okafor", username: "maya.okafor" };
export const JORDAN = "Jordan Kim";
export const LEA = "Léa Dubois";
export const RAVI = "Ravi Patel";
export const GROUP_TITLE = "Tahoe Trip 🏔️";

export const FOLDERS = {
  jordan: "jordankim_17841400000000001",
  lea: "leadubois_17841400000000002",
  group: "tahoetrip_17841400000000003",
  request: "cryptodeals99_17841400000000004",
};

/** Messages per file before Instagram starts the next message_N file. Real exports use 10,000. */
export const CHUNK = 100;

const MINUTE = 60_000;
const START = Date.UTC(2026, 8, 1, 17, 0);

interface Msg {
  from: string;
  ts: number;
  text?: string;
  photos?: number;
  video?: boolean;
  share?: { link: string; text?: string; owner?: string };
  reactions?: { emoji: string; actor: string }[];
  unsent?: boolean;
}

interface Thread {
  folder: string;
  box: "inbox" | "message_requests";
  title: string;
  participants: string[];
  group: boolean;
  messages: Msg[];
}

const SMALL_TALK = [
  "how was your day",
  "pretty good, long meeting though",
  "did you see the game last night",
  "no spoilers please i'm watching it tonight",
  "climbing gym tuesday?",
  "yes 7pm works",
  "lol",
  "that's hilarious",
  "ok heading out now",
  "send me that playlist",
];

function jordanThread(): Thread {
  const messages: Msg[] = [];
  for (let i = 0; i < 230; i++) {
    messages.push({ from: i % 2 ? OWNER.name : JORDAN, ts: START + i * 97 * MINUTE, text: SMALL_TALK[i % SMALL_TALK.length] });
  }
  const t = START + 230 * 97 * MINUTE;
  messages.push(
    { from: JORDAN, ts: t + 1 * MINUTE, text: "I booked the cabin at Emerald Bay for December 12 to 14 🎉" },
    { from: OWNER.name, ts: t + 2 * MINUTE, text: "amazing!! I’ll bring the board games", reactions: [{ emoji: "❤️", actor: JORDAN }] },
    { from: JORDAN, ts: t + 3 * MINUTE, photos: 1 },
    { from: JORDAN, ts: t + 4 * MINUTE, text: "Biscuit chewed through my sneakers again 😂" },
    { from: OWNER.name, ts: t + 5 * MINUTE, share: { link: "https://www.instagram.com/reel/C0fakeReel01/", text: "golden retriever does the dishes", owner: "dogsofinsta" } },
    { from: JORDAN, ts: t + 6 * MINUTE, text: "this is literally Biscuit", reactions: [{ emoji: "😂", actor: OWNER.name }] },
    { from: OWNER.name, ts: t + 7 * MINUTE, text: "oops wrong chat", unsent: true },
    { from: OWNER.name, ts: t + 8 * MINUTE, video: true },
  );
  return { folder: FOLDERS.jordan, box: "inbox", title: JORDAN, participants: [JORDAN, OWNER.name], group: false, messages };
}

function leaThread(): Thread {
  const t = START + 3 * 86_400_000;
  const lines: [string, string][] = [
    [LEA, "Salut Maya! On se voit au café à 19h? ☕"],
    [OWNER.name, "oui! the one on Valencia?"],
    [LEA, "yes, Café Réveille. Big news: I start my new job at Figma on Monday!"],
    [OWNER.name, "LÉA!! congrats 🥳🥳"],
    [LEA, "merci ❤️ we’re celebrating at Marufuku after, the ramen place"],
    [OWNER.name, "I’m so in"],
  ];
  const messages: Msg[] = lines.map(([from, text], i) => ({ from, ts: t + i * 11 * MINUTE, text }));
  messages[3].reactions = [{ emoji: "😍", actor: LEA }];
  messages.push({ from: LEA, ts: t + 80 * MINUTE, photos: 2 });
  return { folder: FOLDERS.lea, box: "inbox", title: LEA, participants: [LEA, OWNER.name], group: false, messages };
}

function groupThread(): Thread {
  const t = START + 5 * 86_400_000;
  const lines: [string, string][] = [
    [RAVI, "who's driving to Tahoe?"],
    [JORDAN, "I can drive, my car fits 4"],
    [LEA, "I’ll make playlists 🎶"],
    [OWNER.name, "I’ll handle groceries, someone remind me to get firewood"],
    [RAVI, "I’m bringing my snowboard, ski lift tickets are $189 a day 😬"],
    [JORDAN, "leaving Friday at 6am to beat traffic"],
  ];
  const messages: Msg[] = lines.map(([from, text], i) => ({ from, ts: t + i * 7 * MINUTE, text }));
  messages[5].reactions = [
    { emoji: "👍", actor: RAVI },
    { emoji: "😴", actor: LEA },
  ];
  messages.push({ from: RAVI, ts: t + 50 * MINUTE, share: { link: "https://www.instagram.com/p/C0fakePost02/", text: "best cabin snacks", owner: "snackhacks" } });
  return { folder: FOLDERS.group, box: "inbox", title: GROUP_TITLE, participants: [RAVI, JORDAN, LEA, OWNER.name], group: true, messages };
}

function requestThread(): Thread {
  return {
    folder: FOLDERS.request,
    box: "message_requests",
    title: "cryptodeals99",
    participants: ["cryptodeals99", OWNER.name],
    group: false,
    messages: [{ from: "cryptodeals99", ts: START + 9 * 86_400_000, text: "hey! want to 10x your money?" }],
  };
}

export const threads = (): Thread[] => [jordanThread(), leaThread(), groupThread(), requestThread()];

/** Instagram writes each UTF-8 byte as its own \u00XX escape. */
function mojibakeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7f]+/g, (s) =>
    [...Buffer.from(s, "utf8")].map((b) => "\\u00" + b.toString(16).padStart(2, "0")).join(""),
  );
}

const DIR = "your_instagram_activity/messages";
const photoPath = (thread: Thread, ts: number, i: number) => `${DIR}/${thread.box}/${thread.folder}/photos/${Math.floor(ts / 1000)}${i}.jpg`;
const videoPath = (thread: Thread, ts: number) => `${DIR}/${thread.box}/${thread.folder}/videos/${Math.floor(ts / 1000)}.mp4`;

/** Newest first, split into message_1 (newest), message_2, ... like Instagram does. */
function chunks(thread: Thread): Msg[][] {
  const newestFirst = [...thread.messages].sort((a, b) => b.ts - a.ts);
  const out: Msg[][] = [];
  for (let i = 0; i < newestFirst.length; i += CHUNK) out.push(newestFirst.slice(i, i + CHUNK));
  return out;
}

function jsonMessage(thread: Thread, m: Msg) {
  const out: Record<string, unknown> = { sender_name: m.from, timestamp_ms: m.ts };
  const flags = { is_geoblocked_for_viewer: false, is_unsent_image_by_messenger_kid_parent: false };
  if (m.unsent) return { ...out, is_unsent: true, ...flags };
  if (m.text) out.content = m.text;
  if (m.photos) out.photos = Array.from({ length: m.photos }, (_, i) => ({ uri: photoPath(thread, m.ts, i), creation_timestamp: Math.floor(m.ts / 1000) }));
  if (m.video) out.videos = [{ uri: videoPath(thread, m.ts), creation_timestamp: Math.floor(m.ts / 1000) }];
  if (m.share) {
    out.content = `${m.from.split(" ")[0]} sent an attachment.`;
    out.share = { link: m.share.link, share_text: m.share.text, original_content_owner: m.share.owner };
  }
  if (m.reactions) out.reactions = m.reactions.map((r) => ({ reaction: r.emoji, actor: r.actor, timestamp: Math.floor(m.ts / 1000) + 30 }));
  return { ...out, ...flags };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

/** "Sep 1, 2026 10:00 am", in the given zone, the way the HTML export prints dates. */
export function htmlDate(ts: number, timeZone = "America/Los_Angeles"): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}`;
}

function htmlMessage(thread: Thread, m: Msg): string {
  const body: string[] = [];
  if (m.unsent) body.push(`<div>${esc(m.from)} unsent a message</div>`);
  else if (m.share) {
    body.push(`<div>${esc(m.from.split(" ")[0])} sent an attachment.</div>`);
    body.push(`<div><a target="_blank" href="${esc(m.share.link)}">${esc(m.share.link)}</a></div>`);
    if (m.share.text) body.push(`<div>${esc(m.share.text)}</div>`);
  } else if (m.text) body.push(`<div>${esc(m.text)}</div>`);
  for (let i = 0; i < (m.photos ?? 0); i++) {
    const uri = photoPath(thread, m.ts, i);
    body.push(`<div><a target="_blank" href="${uri}"><img src="${uri}" class="_a6_o _3-96" /></a></div>`);
  }
  if (m.video) {
    const uri = videoPath(thread, m.ts);
    body.push(`<div><video src="${uri}" controls="1" class="_a6_o _3-96"><a target="_blank" href="${uri}"><p>Click for video: ${uri}</p></a></video></div>`);
  }
  const reactions = m.reactions?.length
    ? `<div><ul class="_a6-q">${m.reactions.map((r) => `<li><span>${esc(r.emoji)}${esc(r.actor)}</span></li>`).join("")}</ul></div>`
    : "";
  return (
    `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${esc(m.from)}</h2>` +
    `<div class="_3-95 _a6-p"><div><div></div>${body.join("")}<div></div>${reactions}</div></div>` +
    `<div class="_3-94 _a6-o">${htmlDate(m.ts)}</div></div>`
  );
}

function htmlPage(title: string, inner: string): string {
  return (
    `<html><head><meta charset="utf-8" /><title>${esc(title)}</title><style>._a6-g{margin:0}</style></head>` +
    `<body class="_5vb_ _2yq _a7o5"><div class="clearfix _ikh"><div class="_4bl9"><div class="_li"><div class="_a705">` +
    `<div class="_a70d"><div class="_3-8y _3-95 _3b0b"><div style="width:100%;"><div class="_a70e">${esc(title)}</div>` +
    `</div></div></div><div class="_a706" role="main">${inner}</div></div></div></div></div></body></html>`
  );
}

/** The files Instagram puts in messages/ and personal_information/, as a path to content map. */
export function instagramFiles(format: "json" | "html"): Record<string, string> {
  const files: Record<string, string> = {};
  for (const thread of threads()) {
    chunks(thread).forEach((messages, i) => {
      const base = `${DIR}/${thread.box}/${thread.folder}/message_${i + 1}`;
      if (format === "json") {
        files[base + ".json"] = mojibakeJson({
          participants: thread.participants.map((name) => ({ name })),
          messages: messages.map((m) => jsonMessage(thread, m)),
          title: thread.title,
          is_still_participant: true,
          thread_path: `${thread.box}/${thread.folder}`,
          magic_words: [],
          ...(thread.group ? { joinable_mode: { mode: 1, link: "" } } : {}),
        });
      } else {
        files[base + ".html"] = htmlPage(thread.title, messages.map((m) => htmlMessage(thread, m)).join(""));
      }
    });
  }
  const profile = "personal_information/personal_information/personal_information";
  if (format === "json") {
    files[profile + ".json"] = mojibakeJson({
      profile_user: [
        {
          media_map_data: { "Profile photo": { uri: "media/profile/202601/profile.jpg", creation_timestamp: 1767225600 } },
          string_map_data: {
            Email: { href: "", value: "maya@example.com", timestamp: 0 },
            Name: { href: "", value: OWNER.name, timestamp: 0 },
            Username: { href: "", value: OWNER.username, timestamp: 0 },
            "Private Account": { href: "", value: "True", timestamp: 0 },
          },
        },
      ],
    });
  } else {
    const row = (label: string, value: string) => `<tr><td class="_2pin _a6_q">${label}<div><div>${esc(value)}</div></div></td></tr>`;
    files[profile + ".html"] = htmlPage(
      "Personal information",
      `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><div class="_a6-p"><table style="table-layout: fixed;">` +
        row("Email", "maya@example.com") + row("Username", OWNER.username) + row("Name", OWNER.name) + row("Private Account", "True") +
        `</table></div></div>`,
    );
  }
  return files;
}

/** Other top-level folders a full export carries, so tests see the noise around the messages. */
export function otherFiles(format: "json" | "html"): Record<string, string> {
  const body = (s: string) => (format === "json" ? JSON.stringify({ note: s }) : htmlPage(s, `<div>${esc(s)}</div>`));
  return {
    [`connections/followers_and_following/followers_1.${format}`]: body("followers"),
    [`connections/followers_and_following/following.${format}`]: body("following"),
    [`your_instagram_activity/likes/liked_posts.${format}`]: body("liked posts"),
    [`your_instagram_activity/comments/post_comments_1.${format}`]: body("comments"),
    [`your_instagram_activity/messages/secret_conversations.${format}`]: body("secret conversations"),
    [`your_instagram_activity/messages/reported_conversations.${format}`]: body("reported conversations"),
    [`ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.${format}`]: body("ads"),
    [`security_and_login_information/login_and_profile_creation/login_activity.${format}`]: body("logins"),
    [`logged_information/past_instagram_insights/profile_reach.${format}`]: body("insights"),
    ...(format === "html" ? { "start_here.html": htmlPage("Your information", "<div>Start here</div>") } : {}),
  };
}

/** Paths of the photos and videos the messages point at, so a full export can include them. */
export function mediaPaths(): string[] {
  const out: string[] = [];
  for (const thread of threads()) {
    for (const m of thread.messages) {
      for (let i = 0; i < (m.photos ?? 0); i++) out.push(photoPath(thread, m.ts, i));
      if (m.video) out.push(videoPath(thread, m.ts));
    }
  }
  return out;
}
