import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Avatar } from "../components/Avatar";
import { blurIn, settle } from "../components/motion";
import { formatStamp } from "../format";
import { DISPLAY_FONT, UI_FONT, type Palette } from "../theme";
import type { ReelMessage, ReelParticipant } from "../types";

const MAX_CHARS = 170;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_CHARS) return flat;
  return flat.slice(0, flat.lastIndexOf(" ", MAX_CHARS)) + "…";
}

/** One message blown up to fill the screen, word by word. */
export const Highlight: React.FC<{ message: ReelMessage; person: ReelParticipant; palette: Palette; timeZone: string; duration: number }> = ({
  message,
  person,
  palette,
  timeZone,
  duration,
}) => {
  const frame = useCurrentFrame();
  const text = clip(message.text ?? "");
  const words = text.split(" ");
  const len = text.length;
  const size = len < 18 ? 170 : len < 40 ? 136 : len < 80 ? 108 : len < 120 ? 90 : 78;
  const stagger = Math.max(1, Math.min(3, 40 / words.length));
  const markP = settle(frame, 0, 14, 0.8);
  const drift = interpolate(frame, [0, duration], [0, -30]);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 96px", color: palette.ink }}>
      <AbsoluteFill style={{ background: palette.dark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.25)" }} />
      <div
        style={{
          position: "absolute",
          top: 300,
          left: 70,
          fontFamily: DISPLAY_FONT,
          fontSize: 520,
          lineHeight: 1,
          color: palette.accent,
          opacity: 0.9 * markP,
          transform: `translateY(${(1 - markP) * -80}px) rotate(${(1 - markP) * -12}deg)`,
        }}
      >
        “
      </div>
      <div style={{ transform: `translateY(${drift}px)` }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: size, lineHeight: 1.08, letterSpacing: -0.5, position: "relative" }}>
          {words.map((w, i) => (
            <span key={i} style={{ display: "inline-block", marginRight: "0.22em", ...blurIn(frame, 6 + i * stagger, 30) }}>
              {w}
            </span>
          ))}
        </div>
        <div
          style={{
            ...blurIn(frame, 14 + words.length * stagger, 20),
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 70,
            fontFamily: UI_FONT,
          }}
        >
          <Avatar person={person} size={84} />
          <div>
            <div style={{ fontSize: 38, fontWeight: 700 }}>{person.name}</div>
            <div style={{ fontSize: 27, color: palette.sub, marginTop: 4 }}>{formatStamp(message.ts, timeZone)}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
