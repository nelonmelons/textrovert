import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import type { Palette } from "../theme";

/** Slow drifting color blobs over the mood's base color, with animated film grain on top. */
export const Background: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (i: number, x: number, y: number, size: number) => {
    const dx = Math.sin(t * 0.35 + i * 2.1) * 120;
    const dy = Math.cos(t * 0.28 + i * 1.3) * 160;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x + dx - size / 2,
          top: y + dy - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          background: palette.blobs[i],
          opacity: palette.dark ? 0.55 : 0.75,
          filter: "blur(160px)",
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ background: palette.base, overflow: "hidden" }}>
      {blob(0, 180, 320, 900)}
      {blob(1, 920, 1000, 1000)}
      {blob(2, 300, 1650, 900)}
      <AbsoluteFill
        style={{
          background: palette.dark
            ? "radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(0,0,0,0.55) 100%)"
            : "radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(120,60,40,0.18) 100%)",
        }}
      />
      <Grain seed={frame % 8} />
    </AbsoluteFill>
  );
};

export const Grain: React.FC<{ seed: number; opacity?: number }> = ({ seed, opacity = 0.11 }) => (
  <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
    <svg width="100%" height="100%">
      <filter id={"grain" + seed}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
    </svg>
  </AbsoluteFill>
);
