import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";

import { blurIn, settle } from "../components/motion";
import { DISPLAY_FONT, type Palette } from "../theme";
import { MAX_PHOTOS } from "../timeline";

const SLOTS = [
  { x: 90, y: 420, r: -7 },
  { x: 560, y: 360, r: 6 },
  { x: 150, y: 930, r: 5 },
  { x: 590, y: 880, r: -5 },
  { x: 110, y: 1400, r: -3 },
  { x: 560, y: 1380, r: 8 },
];

export const photoSrc = (photo: string) => (/^(https?:|data:)/.test(photo) ? photo : staticFile(photo));

/** Polaroid-style prints dropped onto the background one after another. */
export const Collage: React.FC<{ photos: string[]; palette: Palette }> = ({ photos, palette }) => {
  const frame = useCurrentFrame();
  const shown = photos.slice(0, MAX_PHOTOS);
  const size = shown.length <= 2 ? 560 : shown.length <= 4 ? 430 : 400;
  return (
    <AbsoluteFill style={{ color: palette.ink }}>
      <div style={{ ...blurIn(frame, 0), position: "absolute", top: 150, width: "100%", textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: 110 }}>
        The camera roll
      </div>
      {shown.map((photo, i) => {
        const slot = shown.length <= 2 ? { x: 80 + i * 360, y: 520 + i * 420, r: i ? 6 : -6 } : SLOTS[i];
        const p = settle(frame, 6 + i * 7, 13, 0.8);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: slot.x,
              top: slot.y,
              padding: "20px 20px 70px",
              background: "#fbfaf7",
              borderRadius: 10,
              boxShadow: "0 30px 70px rgba(0,0,0,0.4)",
              transform: `translateY(${(1 - p) * 300}px) rotate(${slot.r * p + (1 - p) * 25}deg) scale(${1.25 - 0.25 * p})`,
              opacity: Math.min(1, p * 2),
            }}
          >
            <Img src={photoSrc(photo)} style={{ width: size, height: size, objectFit: "cover", display: "block", borderRadius: 4 }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
