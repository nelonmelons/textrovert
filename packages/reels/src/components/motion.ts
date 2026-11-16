import type { CSSProperties } from "react";
import { interpolate, spring } from "remotion";

import { FPS } from "../timeline";

/** 0→1 settle used for most entrances. */
export const settle = (frame: number, delay = 0, damping = 18, mass = 0.7) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, mass, stiffness: 140 } });

/** Opacity, blur and lift for an element that resolves into focus. */
export function blurIn(frame: number, delay = 0, distance = 40): CSSProperties {
  const p = settle(frame, delay, 20, 0.8);
  return {
    opacity: interpolate(p, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
    filter: `blur(${(1 - p) * 18}px)`,
    transform: `translateY(${(1 - p) * distance}px)`,
  };
}

/** Scene-level fade in and out over a few frames, with a touch of blur and zoom. */
export function sceneEdges(frame: number, duration: number, edge = 9): CSSProperties {
  const inP = interpolate(frame, [0, edge], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outP = interpolate(frame, [duration - edge, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = Math.min(inP, outP);
  return { opacity: p, filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined, transform: `scale(${1.02 - 0.02 * p})` };
}
