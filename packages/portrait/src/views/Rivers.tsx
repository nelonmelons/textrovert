import { scaleLinear } from "d3-scale";
import { area, curveCatmullRom, stack, stackOffsetWiggle, stackOrderInsideOut } from "d3-shape";
import { useEffect, useMemo, useRef, useState } from "react";

import { fmtCount, haptic, rawSeries, type Model } from "../model";

const RIVER_COLORS = ["#ffb36b", "#ff8a7a", "#f06d9b", "#c77dff", "#8f8bff", "#6fa8ff", "#5cc8d9", "#6fdcb0", "#b8e07a", "#ffd66b", "#e8a3ff", "#ff9ec2"];
const TOP = 12;

export function Rivers({ model, onOpen }: { model: Model; onOpen: (id: string) => void }) {
  const { data } = model;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 520 });
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const people = useMemo(
    () =>
      [...data.people]
        .map((p) => ({ p, series: rawSeries(p) }))
        .sort((a, b) => b.series.reduce((s, n) => s + n, 0) - a.series.reduce((s, n) => s + n, 0))
        .slice(0, TOP),
    [data],
  );

  const phases = useMemo(() => {
    const steps = data.timeline.starts.length;
    const window = Math.max(1, Math.round(steps / 12));
    const biggest = Math.max(1, ...model.circles.map((g) => g.total));
    const eraCircles = model.circles.filter((g) => g.total >= biggest * 0.04);
    const leader = Array.from({ length: steps }, (_, i) => {
      let best: { id: string; n: number } | null = null;
      for (const g of eraCircles) {
        let n = 0;
        let span = 0;
        for (let k = Math.max(0, i - window); k <= Math.min(steps - 1, i + window); k++, span++) n += g.series[k];
        // How far above its own average the chat runs: the circle that defines the period, not just the loudest one.
        const score = n / span / (g.total / steps + 1);
        if (!best || score > best.n) best = { id: g.id, n: score };
      }
      return best && best.n > 0 ? best.id : null;
    });
    let out: { id: string | null; from: number; to: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const lastPhase = out[out.length - 1];
      if (lastPhase && lastPhase.id === leader[i]) lastPhase.to = i;
      else out.push({ id: leader[i], from: i, to: i });
    }
    // Fold eras shorter than two steps into the one before, so the bands read as chapters rather than noise.
    const minLength = Math.max(2, Math.round(steps / 10));
    out = out.reduce<typeof out>((acc, ph) => {
      const prev = acc[acc.length - 1];
      if (prev && (ph.to - ph.from + 1 < minLength || prev.id === ph.id)) prev.to = ph.to;
      else acc.push({ ...ph });
      return acc;
    }, []);
    if (out.length > 1 && out[0].to - out[0].from + 1 < minLength) out = [{ ...out[1], from: 0 }, ...out.slice(2)];
    return out;
  }, [data, model]);

  const steps = data.timeline.starts.length;
  const padTop = 54;
  const padBottom = 30;
  const plotH = Math.max(200, size.h - padTop - padBottom);
  const rows = Array.from({ length: steps }, (_, i) => Object.fromEntries(people.map(({ p, series }) => [p.id, series[i]])) as Record<string, number>);
  const layers = stack<Record<string, number>>()
    .keys(people.map(({ p }) => p.id))
    .offset(stackOffsetWiggle)
    .order(stackOrderInsideOut)(rows);
  const lo = Math.min(...layers.flatMap((l) => l.map((d) => d[0])));
  const hi = Math.max(...layers.flatMap((l) => l.map((d) => d[1])));
  const x = scaleLinear().domain([0, steps - 1]).range([10, size.w - 10]);
  const y = scaleLinear().domain([lo, hi]).range([padTop + plotH, padTop]);
  const shape = area<[number, number]>()
    .x((_, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveCatmullRom.alpha(0.5));
  const colorOf = new Map(people.map(({ p }, i) => [p.id, RIVER_COLORS[i % RIVER_COLORS.length]]));

  const tap = (id: string) => {
    haptic();
    setActive(id);
    window.setTimeout(() => onOpen(id), 320);
  };

  const placedLabels: [number, number, number][] = [];
  const tickEvery = Math.ceil(steps / Math.max(3, Math.floor(size.w / 80)));

  return (
    <div className="rivers">
      <header className="view-head">
        <p className="eyebrow">Rivers</p>
        <h1>Who filled your days</h1>
        <p className="sub">Top {people.length} people, {data.timeline.unit === "week" ? "week by week" : "month by month"}. Tap a river to open their story.</p>
      </header>
      <div className="river-wrap" ref={wrapRef}>
        <svg width={size.w} height={size.h} className={active ? "has-active" : ""}>
          <defs>
            <filter id="river-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          {phases.map((ph, i) => {
            const x0 = ph.from === 0 ? 0 : (x(ph.from) + x(ph.from - 1)) / 2;
            const x1 = ph.to === steps - 1 ? size.w : (x(ph.to) + x(ph.to + 1)) / 2;
            const title = ph.id ? model.group.get(ph.id)?.title ?? "" : "";
            const room = x1 - x0;
            return (
              <g key={i} className="phase">
                <rect x={x0} y={8} width={room} height={size.h - 16} fill={i % 2 ? "rgba(255,240,220,0.025)" : "transparent"} />
                {i > 0 && <line x1={x0} x2={x0} y1={14} y2={size.h - padBottom} />}
                {title && room > 72 && (
                  <text x={x0 + 6} y={26} className="phase-label">
                    <tspan>{fitText(title, room - 10)}</tspan>
                  </text>
                )}
                {title && room > 72 && (
                  <text x={x0 + 6} y={39} className="phase-kicker">
                    era
                  </text>
                )}
              </g>
            );
          })}
          <g filter="url(#river-glow)" opacity="0.45">
            {layers.map((l) => (
              <path key={l.key} d={shape(l as unknown as [number, number][]) ?? ""} fill={colorOf.get(l.key)} />
            ))}
          </g>
          {layers.map((l, i) => (
            <path
              key={l.key}
              className={"river" + (active === l.key ? " active" : "")}
              d={shape(l as unknown as [number, number][]) ?? ""}
              fill={colorOf.get(l.key)}
              style={{ animationDelay: i * 40 + "ms" }}
              onClick={() => tap(l.key)}
            />
          ))}
          {layers.map((l) => {
            let best = 0;
            let bestH = 0;
            const thick = l.map((d) => y(d[0]) - y(d[1]));
            const mid = l.map((d) => (y(d[0]) + y(d[1])) / 2);
            l.forEach((_, i) => {
              if (i === 0 || i === steps - 1 || Math.abs(mid[i + 1] - mid[i - 1]) > 24) return;
              const hh = Math.min(thick[i - 1], thick[i], thick[i + 1]);
              if (hh > bestH) [best, bestH] = [i, hh];
            });
            if (bestH < 19) return null;
            const d = l[best];
            const p = model.person.get(l.key)!;
            const half = p.name.length * 3.6 + 6;
            const lx = Math.max(half, Math.min(size.w - half, x(best)));
            const ly = (y(d[0]) + y(d[1])) / 2 + 4;
            if (placedLabels.some(([px, py, ph]) => Math.abs(px - lx) < ph + half && Math.abs(py - ly) < 14)) return null;
            placedLabels.push([lx, ly, half]);
            return (
              <text key={l.key} x={lx} y={ly} className="river-label" textAnchor="middle" pointerEvents="none">
                {p.name}
              </text>
            );
          })}
          {data.timeline.labels.map((label, i) =>
            i % tickEvery === 0 ? (
              <text key={i} x={x(i)} y={size.h - 10} className="tick" textAnchor={i === 0 ? "start" : "middle"}>
                {label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <ol className="river-key">
        {people.map(({ p, series }) => (
          <li key={p.id}>
            <button onClick={() => tap(p.id)} className={active === p.id ? "active" : ""}>
              <i style={{ background: colorOf.get(p.id) }} />
              {p.name}
              <small>{fmtCount(series.reduce((s, n) => s + n, 0))}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function fitText(s: string, px: number) {
  const max = Math.max(3, Math.floor(px / 6.4));
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
