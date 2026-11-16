import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { blurIn, settle } from "../components/motion";
import { planDay } from "../format";
import { DISPLAY_FONT, UI_FONT, type Palette } from "../theme";
import { MAX_PLANS } from "../timeline";
import type { ReelPlan } from "../types";

/** An itinerary of what the chat decided, dated plans first in calendar order. */
export const PlansCard: React.FC<{ plans: ReelPlan[]; palette: Palette }> = ({ plans, palette }) => {
  const frame = useCurrentFrame();
  const shown = plans.slice(0, MAX_PLANS);
  const card = palette.dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)";
  const line = settle(frame, 10, 30, 1);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px", color: palette.ink, fontFamily: UI_FONT }}>
      <div style={{ ...blurIn(frame, 0), fontSize: 30, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: palette.accent }}>
        {palette.emoji} What we said we'd do
      </div>
      <div style={{ ...blurIn(frame, 4), fontFamily: DISPLAY_FONT, fontSize: 128, lineHeight: 1, marginTop: 18, marginBottom: 60 }}>The plan</div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 63,
            top: 40,
            width: 4,
            height: `calc((100% - 80px) * ${line})`,
            background: `linear-gradient(${palette.accent}, transparent)`,
            borderRadius: 2,
          }}
        />
        {shown.map((plan, i) => {
          const p = settle(frame, 12 + i * 8, 16, 0.7);
          const day = plan.date ? planDay(plan.date) : null;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 30,
                marginBottom: 26,
                opacity: interpolate(p, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
                transform: `translateX(${(1 - p) * 120}px)`,
                filter: `blur(${(1 - p) * 12}px)`,
              }}
            >
              <div
                style={{
                  width: 130,
                  height: 130,
                  borderRadius: 34,
                  background: day ? palette.accent : card,
                  color: day ? palette.base : palette.ink,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                  position: "relative",
                }}
              >
                {day ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{day.month}</div>
                    <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1 }}>{day.day}</div>
                  </>
                ) : plan.when && plan.when.length <= 12 ? (
                  <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, textAlign: "center", padding: "0 10px" }}>{plan.when}</div>
                ) : (
                  <div style={{ fontSize: 54 }}>✦</div>
                )}
              </div>
              <div style={{ flex: 1, padding: "26px 34px", borderRadius: 34, background: card, backdropFilter: "blur(20px)" }}>
                <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.2 }}>{plan.what}</div>
                {!day && plan.when.length > 12 ? <div style={{ fontSize: 28, color: palette.sub, marginTop: 8 }}>{plan.when}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
