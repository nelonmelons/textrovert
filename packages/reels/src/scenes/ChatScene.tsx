import { measureText } from "@remotion/layout-utils";
import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";

import { initials, formatStamp, formatTime } from "../format";
import { settle } from "../components/motion";
import { CHAT_FONT, UI_FONT, type Palette, type Skin } from "../theme";
import { FPS, SKIP_MARKER_MIN, separatorBefore, type Beat } from "../timeline";
import type { MediaKind, ReelMessage, ReelParticipant, ReelProps } from "../types";

const PANEL_W = 968;
const PANEL_H = 1580;
const PANEL_TOP = 236;
const HEADER_H = 168;
const COMPOSER_H = 128;
const VIEWPORT_H = PANEL_H - HEADER_H - COMPOSER_H;
const SIDE = 26;
const AVATAR = 58;
const FONT_SIZE = 38;
const LINE_H = 50;
const PAD_X = 32;
const PAD_Y = 19;
const MAX_TEXT_W = 590;
const TYPING_H = 96;
const RUN_GAP = 6;
const GROUP_GAP = 22;
const NAME_H = 44;
const REACTION_H = 34;
const MAX_LINES = 7;

interface Wrapped {
  lines: string[];
  width: number;
  lastWidth: number;
}

const measure = (text: string) => measureText({ text, fontFamily: CHAT_FONT, fontSize: FONT_SIZE, validateFontIsLoaded: false }).width;

/** Greedy word wrap with the same font the bubble renders with, so heights are known before anything is drawn. */
function wrap(text: string): Wrapped {
  const lines: string[] = [];
  const space = measure("a b") - measure("ab");
  for (const paragraph of text.split("\n")) {
    let line = "";
    let width = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = measure(word);
      if (w > MAX_TEXT_W) {
        if (line) lines.push(line);
        let chunk = "";
        for (const ch of [...word]) {
          if (measure(chunk + ch) > MAX_TEXT_W) {
            lines.push(chunk);
            chunk = "";
          }
          chunk += ch;
        }
        line = chunk;
        width = measure(chunk);
        continue;
      }
      if (line && width + space + w > MAX_TEXT_W) {
        lines.push(line);
        line = word;
        width = w;
      } else {
        line = line ? line + " " + word : word;
        width = line === word ? w : width + space + w;
      }
    }
    lines.push(line);
  }
  const kept = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  while (kept.length > 1 && !kept[kept.length - 1]) kept.pop();
  const shown = lines.length > MAX_LINES ? [...kept.slice(0, -1), kept[kept.length - 1] + " …"] : kept;
  const widths = shown.map(measure);
  return { lines: shown, width: Math.min(MAX_TEXT_W, Math.max(...widths)), lastWidth: widths[widths.length - 1] };
}

const MEDIA: Record<MediaKind, { icon: string; label: string; w: number; h: number }> = {
  photo: { icon: "📷", label: "Photo", w: 380, h: 300 },
  video: { icon: "🎬", label: "Video", w: 380, h: 300 },
  gif: { icon: "✨", label: "GIF", w: 340, h: 260 },
  sticker: { icon: "🧸", label: "Sticker", w: 220, h: 220 },
  share: { icon: "↗", label: "Shared a post", w: 470, h: 132 },
  audio: { icon: "🎙️", label: "Voice message", w: 430, h: 104 },
  file: { icon: "📎", label: "File", w: 400, h: 112 },
  location: { icon: "📍", label: "Location", w: 400, h: 112 },
};

type Item =
  | { kind: "separator"; key: string; height: number; at: number; stamp: string; skipped: number }
  | { kind: "name"; key: string; height: number; at: number; name: string; color: string }
  | {
      kind: "bubble";
      key: string;
      height: number;
      at: number;
      typingAt: number | null;
      message: ReelMessage;
      color: string;
      wrapped: Wrapped | null;
      bubbleW: number;
      bubbleH: number;
      first: boolean;
      last: boolean;
      showName: boolean;
      timeLine: boolean;
      highlighted: boolean;
    };

function layout(props: ReelProps, beats: Beat[], skin: Skin, highlights: number[]): Item[] {
  const color = (name: string) => props.participants.find((p) => p.name === name)?.color ?? "#888";
  const group = props.chat.kind === "group";
  const items: Item[] = [];
  props.messages.forEach((m, i) => {
    const prev = props.messages[i - 1];
    const next = props.messages[i + 1];
    const beat = beats[i];
    const start = beat.typingAt ?? beat.appearAt;
    const separator = separatorBefore(prev, m);
    const first = !!separator || prev!.sender !== m.sender;
    const last = !next || !!separatorBefore(m, next) || next.sender !== m.sender;
    if (separator) {
      const skipped = prev && (m.skippedBefore ?? 0) >= SKIP_MARKER_MIN ? m.skippedBefore! : 0;
      const stamp = separator === "time" ? formatStamp(m.ts, props.episode.timeZone) : "";
      items.push({ kind: "separator", key: "s" + m.id, height: (stamp ? 92 : 64) + (stamp && skipped ? 36 : 0), at: start, stamp, skipped });
    } else if (first && prev) {
      items[items.length - 1].height += GROUP_GAP - RUN_GAP;
    }
    const showName = group && !m.isMe && first;
    if (showName && !skin.namesInside) items.push({ kind: "name", key: "n" + m.id, height: NAME_H, at: start, name: m.sender, color: color(m.sender) });
    const wrapped = m.text ? wrap(m.text) : null;
    const media = !m.text && m.media ? MEDIA[m.media] : null;
    const nameInside = showName && skin.namesInside ? 44 : 0;
    let bubbleW = wrapped ? wrapped.width + PAD_X * 2 : (media ?? MEDIA.file).w;
    let bubbleH = wrapped ? wrapped.lines.length * LINE_H + PAD_Y * 2 : (media ?? MEDIA.file).h;
    let timeLine = false;
    if (skin.timeInBubble && wrapped) {
      if (wrapped.lastWidth + 150 <= MAX_TEXT_W) bubbleW = Math.max(bubbleW, wrapped.lastWidth + 150 + PAD_X * 2);
      else {
        bubbleH += 30;
        timeLine = true;
      }
    }
    if (nameInside) {
      bubbleH += nameInside;
      bubbleW = Math.max(bubbleW, Math.min(MAX_TEXT_W, measure(m.sender) * 0.8) + PAD_X * 2);
    }
    const reactions = m.reactions?.length ? REACTION_H : 0;
    items.push({
      kind: "bubble",
      key: "b" + m.id,
      height: bubbleH + reactions + RUN_GAP,
      at: beat.appearAt,
      typingAt: beat.typingAt,
      message: m,
      color: color(m.sender),
      wrapped,
      bubbleW,
      bubbleH,
      first,
      last,
      showName: showName && skin.namesInside,
      timeLine,
      highlighted: highlights.includes(m.id),
    });
  });
  return items;
}

const grow = (frame: number, at: number) => spring({ frame: frame - at, fps: FPS, config: { damping: 200, mass: 0.6 }, durationInFrames: 10 });

/** How tall an item currently is: it grows in when it lands, and a bubble first holds a typing indicator's space. */
function currentHeight(item: Item, frame: number): number {
  if (item.kind !== "bubble" || item.typingAt === null) return frame < item.at ? 0 : item.height * grow(frame, item.at);
  if (frame < item.typingAt) return 0;
  const typing = (TYPING_H + RUN_GAP) * grow(frame, item.typingAt);
  return frame < item.at ? typing : typing + (item.height - TYPING_H - RUN_GAP) * grow(frame, item.at);
}

export const ChatScene: React.FC<{
  props: ReelProps;
  beats: Beat[];
  highlights: number[];
  chatFrom: number;
  skin: Skin;
  palette: Palette;
}> = ({ props, beats, highlights, chatFrom, skin, palette }) => {
  const frame = useCurrentFrame() + chatFrom;
  const items = useMemo(() => layout(props, beats, skin, highlights), [props, beats, skin, highlights]);
  const heights = items.map((item) => currentHeight(item, frame));
  const total = heights.reduce((a, b) => a + b, 0) + 28;
  const offset = VIEWPORT_H - total;
  const lastShown = [...props.messages].reverse().find((_, j) => beats[props.messages.length - 1 - j].appearAt <= frame) ?? props.messages[0];
  const enter = settle(frame - chatFrom, 0, 22, 0.9);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 96,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 18,
          fontFamily: UI_FONT,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 1.5,
          color: palette.ink,
          textTransform: "uppercase",
        }}
      >
        <span style={{ opacity: 0.7 }}>{skin.label}</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>{formatStamp(lastShown.ts, props.episode.timeZone).split(" · ")[0]}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: (1080 - PANEL_W) / 2,
          top: PANEL_TOP,
          width: PANEL_W,
          height: PANEL_H,
          borderRadius: 72,
          overflow: "hidden",
          background: skin.screen,
          boxShadow: "0 60px 140px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.08)",
          transform: `translateY(${(1 - enter) * 80}px) scale(${0.96 + 0.04 * enter})`,
          fontFamily: CHAT_FONT,
        }}
      >
        {skin.pattern ? <AbsoluteFill style={{ background: skin.pattern }} /> : null}
        <div style={{ position: "absolute", top: HEADER_H, left: 0, width: PANEL_W, height: VIEWPORT_H, overflow: "hidden" }}>
          <div style={{ transform: `translateY(${offset}px)` }}>
            {items.map((item, i) =>
              heights[i] <= 0 ? null : (
                <div key={item.key} style={{ height: heights[i], position: "relative" }}>
                  <ItemView item={item} frame={frame} props={props} skin={skin} palette={palette} />
                </div>
              ),
            )}
          </div>
        </div>
        <Header props={props} skin={skin} />
        <Composer skin={skin} />
      </div>
    </AbsoluteFill>
  );
};

const ItemView: React.FC<{ item: Item; frame: number; props: ReelProps; skin: Skin; palette: Palette }> = ({ item, frame, props, skin, palette }) => {
  const p = settle(frame, item.kind === "bubble" ? (item.typingAt ?? item.at) : item.at, 20, 0.6);
  const fade: React.CSSProperties = { opacity: interpolate(p, [0, 0.7], [0, 1], { extrapolateRight: "clamp" }) };
  if (item.kind === "separator") {
    return (
      <div style={{ ...fade, textAlign: "center", paddingTop: 22, color: skin.separator, fontSize: 25, fontWeight: 600 }}>
        {item.stamp ? <div>{item.stamp}</div> : null}
        {item.skipped > 0 ? (
          <div style={{ marginTop: item.stamp ? 10 : 0, fontSize: 23, fontWeight: 500, opacity: 0.85 }}>
            ··· {item.skipped} {item.skipped === 1 ? "message" : "messages"} later ···
          </div>
        ) : null}
      </div>
    );
  }
  if (item.kind === "name") {
    return (
      <div style={{ ...fade, paddingLeft: SIDE + (skin.avatars ? AVATAR + 16 : 0) + 18, paddingTop: 6, fontSize: 27, color: skin.nameColor, fontWeight: 500 }}>
        {item.name}
      </div>
    );
  }
  return <BubbleView item={item} frame={frame} props={props} skin={skin} palette={palette} />;
};

const BubbleView: React.FC<{ item: Extract<Item, { kind: "bubble" }>; frame: number; props: ReelProps; skin: Skin; palette: Palette }> = ({
  item,
  frame,
  props,
  skin,
  palette,
}) => {
  const m = item.message;
  const me = m.isMe;
  const typing = item.typingAt !== null && frame < item.at;
  const p = settle(frame, item.at, 16, 0.55);
  const left = SIDE + (skin.avatars && !me ? AVATAR + 16 : 0);
  const R = skin.radius;
  const J = skin.joinRadius;
  const radius = me
    ? `${R}px ${item.first ? R : J}px ${item.last ? R : J}px ${R}px`
    : `${item.first ? R : J}px ${R}px ${R}px ${item.last ? R : J}px`;
  const bg = me ? skin.meBubble : skin.otherBubble;
  const textColor = me ? skin.meText : skin.otherText;
  const glow = item.highlighted ? interpolate(frame - item.at, [0, 8, 30], [0, 1, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  const avatar =
    skin.avatars && !me && item.last ? (
      <div
        style={{
          position: "absolute",
          left: SIDE,
          top: (typing ? TYPING_H : item.bubbleH) - AVATAR,
          width: AVATAR,
          height: AVATAR,
          borderRadius: "50%",
          background: item.color,
          color: "#fff",
          fontFamily: UI_FONT,
          fontWeight: 700,
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: Math.min(1, settle(frame, item.typingAt ?? item.at)),
        }}
      >
        {initials(m.sender)}
      </div>
    ) : null;

  if (typing) {
    const tp = settle(frame, item.typingAt!, 16, 0.55);
    return (
      <>
        {avatar}
        <div
          style={{
            position: "absolute",
            left,
            top: 0,
            width: 150,
            height: TYPING_H - 8,
            borderRadius: R,
            background: skin.otherBubble,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            transform: `scale(${0.6 + 0.4 * tp})`,
            transformOrigin: "bottom left",
            opacity: tp,
            boxShadow: skin.dark ? undefined : "0 1px 1px rgba(0,0,0,0.08)",
          }}
        >
          {[0, 1, 2].map((d) => (
            <div
              key={d}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: skin.sub,
                opacity: 0.45 + 0.55 * Math.max(0, Math.sin((frame - d * 4) / 4)),
                transform: `translateY(${-6 * Math.max(0, Math.sin((frame - d * 4) / 4))}px)`,
              }}
            />
          ))}
        </div>
      </>
    );
  }

  const media = !m.text && m.media ? MEDIA[m.media] : null;
  return (
    <>
      {avatar}
      <div
        style={{
          position: "absolute",
          top: 0,
          ...(me ? { right: SIDE } : { left }),
          width: item.bubbleW,
          height: item.bubbleH,
          transform: `scale(${0.72 + 0.28 * p})`,
          transformOrigin: me ? "bottom right" : "bottom left",
          opacity: interpolate(p, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
          filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
        }}
      >
        {skin.tail && item.last ? <Tail me={me} color={me ? lastHex(skin.meBubble) : skin.otherBubble} whatsapp={skin.namesInside} /> : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            background: bg,
            color: textColor,
            boxShadow: [
              skin.dark ? "" : "0 1px 1.5px rgba(0,0,0,0.1)",
              glow ? `0 0 0 ${4 * glow}px ${palette.accent}, 0 0 ${50 * glow}px ${palette.accent}` : "",
            ]
              .filter(Boolean)
              .join(", ") || undefined,
            overflow: "hidden",
          }}
        >
          {media ? (
            <MediaCard kind={m.media!} color={item.color} skin={skin} me={me} />
          ) : (
            <div style={{ padding: `${PAD_Y}px ${PAD_X}px`, fontSize: FONT_SIZE, lineHeight: LINE_H + "px" }}>
              {item.showName ? (
                <div style={{ color: item.color, fontSize: 27, fontWeight: 600, lineHeight: "36px", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.sender}
                </div>
              ) : null}
              {item.wrapped!.lines.map((line, k) => (
                <div key={k} style={{ whiteSpace: "pre", height: LINE_H }}>
                  {line}
                </div>
              ))}
            </div>
          )}
          {skin.timeInBubble ? (
            <div style={{ position: "absolute", right: 22, bottom: 10, fontSize: 21, color: me ? "#5f7f5b" : "#8696a0" }}>
              {formatTime(m.ts, props.episode.timeZone)}
            </div>
          ) : null}
        </div>
        {m.reactions?.length ? (
          <div
            style={{
              position: "absolute",
              top: item.bubbleH - 12,
              ...(me ? { right: 18 } : { left: 18 }),
              padding: "3px 12px",
              borderRadius: 24,
              background: skin.reactionBg,
              border: `3px solid ${skin.screen}`,
              fontSize: 26,
              lineHeight: "34px",
              transform: `scale(${settle(frame, item.at + 8, 12, 0.5)})`,
            }}
          >
            {[...new Set(m.reactions)].slice(0, 3).join("")}
            {m.reactions.length > 1 ? <span style={{ fontSize: 21, marginLeft: 6, color: skin.sub }}>{m.reactions.length}</span> : null}
          </div>
        ) : null}
      </div>
    </>
  );
};

const lastHex = (css: string) => css.match(/#[0-9a-f]{6}/gi)?.pop() ?? css;

const Tail: React.FC<{ me: boolean; color: string; whatsapp: boolean }> = ({ me, color, whatsapp }) =>
  whatsapp ? (
    <svg width="26" height="30" viewBox="0 0 26 30" style={{ position: "absolute", top: 0, ...(me ? { right: -14 } : { left: -14 }), transform: me ? undefined : "scaleX(-1)" }}>
      <path d="M0 0 H26 L4 26 Z" fill={color} />
    </svg>
  ) : (
    <svg width="34" height="40" viewBox="0 0 34 40" style={{ position: "absolute", bottom: 0, ...(me ? { right: -12 } : { left: -12 }), transform: me ? undefined : "scaleX(-1)" }}>
      <path d="M0 0 C2 22 10 32 34 40 C16 40 6 37 0 32 Z" fill={color} />
    </svg>
  );

const MediaCard: React.FC<{ kind: MediaKind; color: string; skin: Skin; me: boolean }> = ({ kind, color, skin, me }) => {
  const info = MEDIA[kind];
  const visual = kind === "photo" || kind === "video" || kind === "gif" || kind === "sticker";
  if (visual) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${color}cc, ${color}55 60%, rgba(255,255,255,0.15))`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "#fff",
          fontFamily: UI_FONT,
          fontWeight: 600,
          fontSize: 26,
        }}
      >
        <div style={{ fontSize: 76 }}>{info.icon}</div>
        <div style={{ opacity: 0.9 }}>{info.label}</div>
      </div>
    );
  }
  const textColor = me ? skin.meText : skin.otherText;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "0 28px", height: "100%", color: textColor, fontSize: 32 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 38,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {info.icon}
      </div>
      {kind === "audio" ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {Array.from({ length: 22 }, (_, k) => (
            <div key={k} style={{ width: 6, height: 10 + ((k * 37) % 40), borderRadius: 3, background: textColor, opacity: 0.6 }} />
          ))}
        </div>
      ) : (
        <div style={{ fontWeight: 500 }}>{info.label}</div>
      )}
    </div>
  );
};

const Header: React.FC<{ props: ReelProps; skin: Skin }> = ({ props, skin }) => {
  const others = props.participants.filter((p) => !p.isMe);
  const sub =
    props.chat.kind === "group"
      ? others.length <= 3
        ? others.map((p) => p.name).join(", ")
        : `${others.slice(0, 2).map((p) => p.name).join(", ")} and ${others.length - 2} others`
      : skin.label === "Instagram"
        ? "Active now"
        : skin.label;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: PANEL_W,
        height: HEADER_H,
        background: skin.header,
        borderBottom: `2px solid ${skin.headerBorder}`,
        display: "flex",
        alignItems: "center",
        padding: "34px 34px 0",
        gap: 22,
        boxSizing: "border-box",
      }}
    >
      <svg width="26" height="44" viewBox="0 0 26 44">
        <path d="M22 4 L4 22 L22 40" stroke={skin.label === "iMessage" || skin.label === "Messages" ? "#0a7cff" : skin.title} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "relative", width: 92, height: 80, flexShrink: 0 }}>
        {(others.length > 1 ? others.slice(0, 2) : others).map((p, k) => (
          <div
            key={p.name}
            style={{
              position: "absolute",
              left: others.length > 1 ? k * 30 : 6,
              top: others.length > 1 ? k * 18 : 0,
              width: others.length > 1 ? 62 : 80,
              height: others.length > 1 ? 62 : 80,
              borderRadius: "50%",
              background: p.color,
              border: `3px solid ${skin.header.startsWith("rgba") ? "#f6f6f8" : skin.header}`,
              color: "#fff",
              fontFamily: UI_FONT,
              fontWeight: 700,
              fontSize: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {initials(p.name)}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: skin.title, fontSize: 36, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{props.chat.title}</div>
        <div style={{ color: skin.sub, fontSize: 25, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={skin.title} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      </svg>
      <svg width="50" height="44" viewBox="0 0 26 24" fill="none" stroke={skin.title} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="5" width="16" height="14" rx="3" />
        <path d="M17 10l7-4v12l-7-4z" />
      </svg>
    </div>
  );
};

const Composer: React.FC<{ skin: Skin }> = ({ skin }) => (
  <div
    style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      width: PANEL_W,
      height: COMPOSER_H,
      background: skin.dark ? skin.screen : skin.header,
      display: "flex",
      alignItems: "center",
      padding: "0 28px 14px",
      boxSizing: "border-box",
    }}
  >
    <div
      style={{
        flex: 1,
        height: 82,
        borderRadius: 41,
        background: skin.composer,
        border: skin.dark ? undefined : `2px solid ${skin.headerBorder}`,
        color: skin.composerText,
        fontSize: 31,
        display: "flex",
        alignItems: "center",
        padding: "0 34px",
      }}
    >
      Message…
    </div>
  </div>
);
