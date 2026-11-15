import { useMemo, useState } from "react";

import { haptic, meaningfulTopics, moodColor, NEBULA_COLORS, type Model } from "../model";
import type { Person } from "../types";

const TERRITORIES = 10;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

interface Territory {
  topic: string;
  weight: number;
  members: { p: Person; n: number }[];
  r: number;
  x: number;
  y: number;
  color: string;
  seed: number;
}

export function Atlas({ model, onOpen }: { model: Model; onOpen: (id: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null);

  const territories = useMemo(() => {
    const people = model.data.people.filter((p) => p.total > 0).slice(0, 60);
    const byTopic = new Map<string, { p: Person; n: number }[]>();
    for (const p of people) for (const [t, n] of meaningfulTopics(p.topics)) byTopic.set(t, [...(byTopic.get(t) ?? []), { p, n }]);
    const list: Territory[] = [...byTopic]
      .filter(([, m]) => m.length >= 2)
      .map(([topic, members]) => ({ topic, members: members.sort((a, b) => b.n - a.n), weight: members.reduce((s, m) => s + m.n, 0) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, TERRITORIES)
      .map((t, i) => ({ ...t, r: 0, x: 0, y: 0, color: NEBULA_COLORS[i % NEBULA_COLORS.length], seed: i * 1.7 }));
    const maxW = Math.max(1, ...list.map((t) => t.weight));
    list.forEach((t, i) => {
      t.r = 40 + 70 * Math.sqrt(t.weight / maxW);
      t.x = Math.cos(i * GOLDEN) * i * 22;
      t.y = Math.sin(i * GOLDEN) * i * 22;
    });
    for (let iter = 0; iter < 400; iter++) {
      for (const t of list) {
        t.x *= 0.985;
        t.y *= 0.985;
      }
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + b.r + 8;
          if (d < min) {
            const push = (min - d) / 2;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
          }
        }
    }
    return list;
  }, [model]);

  const pad = 20;
  const minX = Math.min(...territories.map((t) => t.x - t.r)) - pad;
  const minY = Math.min(...territories.map((t) => t.y - t.r)) - pad;
  const maxX = Math.max(...territories.map((t) => t.x + t.r)) + pad;
  const maxY = Math.max(...territories.map((t) => t.y + t.r)) + pad;
  const focused = territories.find((t) => t.topic === focus);

  return (
    <div className="atlas">
      <header className="view-head">
        <p className="eyebrow">Atlas</p>
        <h1>The lands you share</h1>
        <p className="sub">Each territory is something you keep coming back to; the people in it are who you talk about it with.</p>
      </header>
      <div className="atlas-map">
        <svg viewBox={[minX, minY, maxX - minX, maxY - minY].join(" ")} preserveAspectRatio="xMidYMid meet">
          <defs>
            {territories.map((t, i) => (
              <radialGradient key={i} id={"terr-" + i}>
                <stop offset="0" stopColor={t.color} stopOpacity="0.32" />
                <stop offset="0.8" stopColor={t.color} stopOpacity="0.12" />
                <stop offset="1" stopColor={t.color} stopOpacity="0.04" />
              </radialGradient>
            ))}
          </defs>
          {territories.map((t, i) => {
            const dim = focus && focus !== t.topic;
            const inner = t.members.slice(0, 18);
            const firsts = inner.map((m) => m.p.name.split(" ")[0]);
            const maxN = Math.max(1, ...inner.map((m) => m.n));
            return (
              <g
                key={t.topic}
                className={"territory" + (dim ? " dim" : "") + (focus === t.topic ? " focused" : "")}
                style={{ animationDelay: i * 60 + "ms" }}
                onClick={() => {
                  haptic();
                  setFocus(focus === t.topic ? null : t.topic);
                }}
              >
                <path d={blob(t.x, t.y, t.r, t.seed)} fill={"url(#terr-" + i + ")"} stroke={t.color} strokeOpacity="0.45" strokeDasharray="2 4" />
                <text x={t.x} y={t.y - t.r * 0.62} className="terr-label" textAnchor="middle">
                  {t.topic}
                </text>
                {inner.map((m, k) => {
                  const rr = Math.sqrt((k + 0.6) / inner.length) * t.r * 0.62;
                  const a = k * GOLDEN + t.seed;
                  const px = t.x + Math.cos(a) * rr;
                  const py = t.y + 6 + Math.sin(a) * rr * 0.85;
                  const size = 2.2 + 5 * Math.sqrt(m.n / maxN);
                  return (
                    <g key={m.p.id}>
                      <circle cx={px} cy={py} r={size * 2.4} fill={moodColor(m.p.mood)} opacity="0.16" />
                      <circle
                        cx={px}
                        cy={py}
                        r={size}
                        fill={moodColor(m.p.mood)}
                        className="atlas-dot"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(m.p.id);
                        }}
                      />
                      {k < 3 && (
                        <text x={px} y={py + size + 9} className="atlas-name" textAnchor="middle" pointerEvents="none">
                          {firsts.indexOf(firsts[k]) !== firsts.lastIndexOf(firsts[k]) ? m.p.name : firsts[k]}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {!focused && <p className="atlas-hint">Tap a land to see who lives there, or a star to open their story.</p>}
      {focused && (
        <div className="atlas-card">
          <h3>{focused.topic}</h3>
          <div className="mutuals">
            {focused.members.slice(0, 14).map(({ p }) => (
              <button key={p.id} className="chip" onClick={() => onOpen(p.id)} style={{ ["--c" as string]: moodColor(p.mood) }}>
                <i />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A soft, hand-drawn-looking closed outline around a circle. */
function blob(cx: number, cy: number, r: number, seed: number) {
  const n = 9;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.08 * Math.sin(a * 3 + seed) + 0.05 * Math.cos(a * 2 - seed * 1.3);
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
  });
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (i === 0) d += "M" + p1[0].toFixed(1) + "," + p1[1].toFixed(1);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += "C" + [c1, c2, p2].map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  }
  return d + "Z";
}
