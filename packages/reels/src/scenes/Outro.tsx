import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { blurIn, settle } from "../components/motion";
import { formatRange } from "../format";
import { UI_FONT, type Palette } from "../theme";
import type { ReelProps } from "../types";

/** Closing card with a placeholder Textrovert wordmark. */
export const Outro: React.FC<{ props: ReelProps; palette: Palette; duration: number }> = ({ props, palette, duration }) => {
  const frame = useCurrentFrame();
  const mark = settle(frame, 2, 11, 0.7);
  const fade = interpolate(frame, [duration - 12, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", color: palette.ink, fontFamily: UI_FONT, opacity: fade }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ position: "relative", width: 112, height: 100, transform: `scale(${mark}) rotate(${(1 - mark) * -30}deg)` }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: `linear-gradient(135deg, ${palette.blobs[0]}, ${palette.blobs[2]})` }} />
          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: -16,
              width: 34,
              height: 34,
              background: palette.blobs[2],
              transform: "rotate(45deg)",
              borderRadius: 6,
            }}
          />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {[0, 1, 2].map((d) => (
              <div key={d} style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
            ))}
          </div>
        </div>
        <div style={{ ...blurIn(frame, 6, 0), fontSize: 104, fontWeight: 800, letterSpacing: -4 }}>textrovert</div>
      </div>
      <div style={{ ...blurIn(frame, 14, 16), fontSize: 36, color: palette.sub, marginTop: 34 }}>every chat has a story</div>
      <div style={{ ...blurIn(frame, 22, 16), position: "absolute", bottom: 190, fontSize: 28, color: palette.sub, textAlign: "center", lineHeight: 1.5 }}>
        <div style={{ color: palette.ink, fontWeight: 600 }}>{props.chat.title}</div>
        <div>{formatRange(props.episode.startTs, props.episode.endTs, props.episode.timeZone)}</div>
      </div>
    </AbsoluteFill>
  );
};
