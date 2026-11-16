import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Avatar } from "../components/Avatar";
import { blurIn, settle } from "../components/motion";
import { formatRange } from "../format";
import { DISPLAY_FONT, UI_FONT, type Palette, type Skin } from "../theme";
import type { ReelProps } from "../types";

export const TitleCard: React.FC<{ props: ReelProps; palette: Palette; skin: Skin; duration: number }> = ({ props, palette, skin, duration }) => {
  const frame = useCurrentFrame();
  const words = props.episode.title.split(/\s+/);
  const size = props.episode.title.length > 34 ? 118 : props.episode.title.length > 20 ? 138 : 158;
  const zoom = interpolate(frame, [0, duration], [1, 1.05]);
  const people = props.participants.slice(0, 7);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px", color: palette.ink, transform: `scale(${zoom})` }}>
      <div
        style={{
          ...blurIn(frame, 2, 24),
          fontFamily: UI_FONT,
          fontSize: 32,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 30px",
          borderRadius: 60,
          background: palette.dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.55)",
          border: `2px solid ${palette.dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.06)"}`,
          maxWidth: 860,
        }}
      >
        <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>{skin.label}</span>
        <span style={{ opacity: 0.35 }}>•</span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{props.chat.title}</span>
      </div>
      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: size,
          lineHeight: 1.02,
          textAlign: "center",
          marginTop: 70,
          letterSpacing: -1,
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ display: "inline-block", marginRight: "0.24em", ...blurIn(frame, 8 + i * 4, 60) }}>
            {w}
          </span>
        ))}
      </div>
      <div
        style={{
          ...blurIn(frame, 16 + words.length * 4, 20),
          fontFamily: UI_FONT,
          fontSize: 36,
          fontWeight: 500,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: palette.sub,
          marginTop: 56,
        }}
      >
        {formatRange(props.episode.startTs, props.episode.endTs, props.episode.timeZone)}
      </div>
      <div style={{ display: "flex", marginTop: 90 }}>
        {people.map((p, i) => {
          const s = settle(frame, 24 + words.length * 4 + i * 3, 12, 0.6);
          return (
            <Avatar
              key={p.name}
              person={p}
              size={104}
              ring={palette.base}
              style={{ marginLeft: i ? -26 : 0, transform: `scale(${s})`, opacity: Math.min(1, s * 1.5), zIndex: people.length - i }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
