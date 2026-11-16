import React from "react";

import { initials } from "../format";
import { UI_FONT } from "../theme";
import type { ReelParticipant } from "../types";

export const Avatar: React.FC<{ person: ReelParticipant; size: number; ring?: string; style?: React.CSSProperties }> = ({ person, size, ring, style }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 30% 25%, ${person.color}, ${person.color}cc 70%)`,
      color: "#fff",
      fontFamily: UI_FONT,
      fontWeight: 700,
      fontSize: size * 0.38,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: ring ? `${Math.round(size * 0.06)}px solid ${ring}` : undefined,
      boxSizing: "border-box",
      flexShrink: 0,
      ...style,
    }}
  >
    {initials(person.name)}
  </div>
);
