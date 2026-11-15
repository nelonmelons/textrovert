import { useEffect, useMemo, useRef, useState } from "react";

import { fmtCount, fmtDate, haptic, moodColor, MOOD_COLORS, NEBULA_COLORS, rawSeries, weightedSeries, type Model } from "../model";
import type { Person } from "../types";

const MAX_BODIES = 56;
const SECONDS_PER_STEP = 0.75;

interface Body {
  p: Person;
  color: string;
  circle: string | null;
  angle0: number;
  act: number[];
  cum: number[];
  first: number;
  r: number;
  size: number;
  alpha: number;
  x: number;
  y: number;
  born: number;
  ox: number;
  oy: number;
}

interface Star {
  x: number;
  y: number;
  s: number;
  phase: number;
  depth: number;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const lerpAt = (arr: number[], t: number) => {
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(t)));
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * Math.max(0, Math.min(1, t - i));
};

export function Constellation({ model, onOpen, paused }: { model: Model; onOpen: (id: string) => void; paused: boolean }) {
  const { data } = model;
  const steps = data.timeline.starts.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const tRef = useRef(0);
  const playingRef = useRef(true);
  const selectedRef = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [showLegend, setShowLegend] = useState(false);

  const scene = useMemo(() => {
    const people = data.people.filter((p) => p.total > 0).slice(0, MAX_BODIES);
    const tau = data.timeline.unit === "week" ? 1.6 : 1.2;
    const circleOrder = [...new Set(people.map((p) => model.circleOf.get(p.id)).filter((c): c is string => !!c))];
    const groupedSlots: Person[][] = circleOrder.map((c) => people.filter((p) => model.circleOf.get(p.id) === c));
    const loners = people.filter((p) => !model.circleOf.get(p.id));
    // Interleave loners between circles so clusters are separated by open sky.
    const slots: { p: Person; circle: string | null }[] = [];
    const lonerChunks = groupedSlots.length ? Math.ceil(loners.length / groupedSlots.length) : loners.length;
    groupedSlots.forEach((members, i) => {
      for (const p of members) slots.push({ p, circle: circleOrder[i] });
      for (const p of loners.slice(i * lonerChunks, (i + 1) * lonerChunks)) slots.push({ p, circle: null });
    });
    if (!groupedSlots.length) for (const p of loners) slots.push({ p, circle: null });
    const bodies: Body[] = slots.map(({ p, circle }, i) => {
      const w = weightedSeries(p);
      const act: number[] = [];
      let a = 0;
      for (let k = 0; k < w.length; k++) {
        a = a * Math.exp(-1 / tau) + w[k];
        act.push(a);
      }
      const raw = rawSeries(p);
      const cum: number[] = [];
      let c = 0;
      for (const n of raw) cum.push((c += n));
      const first = raw.findIndex((n) => n > 0);
      return {
        p,
        color: moodColor(p.mood),
        circle,
        angle0: (i / slots.length) * Math.PI * 2 + (hash(p.id) - 0.5) * 0.12,
        act,
        cum,
        first: first < 0 ? steps : first,
        r: 0,
        size: 0,
        alpha: 0,
        x: 0,
        y: 0,
        born: 0,
        ox: 0,
        oy: 0,
      };
    });
    const maxAct = Array.from({ length: steps }, (_, k) => Math.max(1, ...bodies.map((b) => b.act[k])));
    const maxCum = Math.max(1, ...bodies.map((b) => b.cum[steps - 1]));
    const index = new Map(bodies.map((b, i) => [b.p.id, i]));
    const edges = data.edges
      .filter((e) => index.has(e.a) && index.has(e.b))
      .slice(0, 110)
      .map((e) => ({ a: index.get(e.a)!, b: index.get(e.b)!, w: e.weight }));
    const maxEdge = Math.max(1, ...edges.map((e) => e.w));
    const circleColor = new Map(circleOrder.map((c, i) => [c, NEBULA_COLORS[i % NEBULA_COLORS.length]]));
    return { bodies, maxAct, maxCum, edges, maxEdge, circleColor };
  }, [data, model, steps]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const count = Math.round((w * h) / 2600);
      stars = Array.from({ length: count }, (_, i) => ({
        x: hash("x" + i) * w,
        y: hash("y" + i) * h,
        s: 0.25 + hash("s" + i) ** 3 * 1.4,
        phase: hash("p" + i) * Math.PI * 2,
        depth: 0.2 + hash("d" + i) * 0.8,
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    let lastStep = -1;
    let lastVisible = -1;
    let raf = 0;
    const startedAt = last;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (pausedRef.current) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const clock = (now - startedAt) / 1000;
      if (playingRef.current) {
        tRef.current = Math.min(steps - 1, tRef.current + dt / SECONDS_PER_STEP);
        if (tRef.current >= steps - 1) {
          playingRef.current = false;
          setPlaying(false);
        }
        if (sliderRef.current) sliderRef.current.value = String(tRef.current);
      }
      const t = tRef.current;
      const s = Math.round(t);
      if (s !== lastStep) {
        lastStep = s;
        setStep(s);
      }

      const top = 150;
      const bottom = 120;
      const cx = w / 2;
      const cy = top + (h - top - bottom) / 2;
      const R = Math.min(w / 2 - 16, (h - top - bottom) / 2, 440);
      const squash = Math.max(0.82, Math.min(1.4, (h - top - bottom) / 2 / R));
      const ease = 1 - Math.exp(-dt * 3.2);
      const sel = selectedRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      bg.addColorStop(0, "#1f1424");
      bg.addColorStop(0.45, "#120c18");
      bg.addColorStop(1, "#07050b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (const st of stars) {
        const tw = 0.55 + 0.45 * Math.sin(clock * (0.6 + st.depth) + st.phase);
        ctx.globalAlpha = tw * st.depth * 0.8;
        ctx.fillStyle = st.depth > 0.85 ? "#ffe9c7" : "#d8d0ff";
        const drift = (clock * 1.5 * st.depth) % w;
        ctx.fillRect((st.x + drift) % w, st.y, st.s, st.s);
      }
      ctx.globalAlpha = 1;

      // orbit rings
      ctx.strokeStyle = "rgba(255, 228, 196, 0.05)";
      ctx.lineWidth = 1;
      for (const k of [0.33, 0.62, 0.95]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * k, R * k * squash, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const maxAct = lerpAt(scene.maxAct, t);
      const present = scene.bodies.filter((b) => t - b.first + 0.5 > 0).sort((a, b) => lerpAt(b.act, t) - lerpAt(a.act, t));
      const rank = new Map(present.map((b, i) => [b, present.length > 1 ? i / (present.length - 1) : 0]));
      let visible = 0;
      for (const b of scene.bodies) {
        const appeared = Math.max(0, Math.min(1, (t - b.first + 0.5) / 0.6));
        const act = lerpAt(b.act, t);
        const c = Math.sqrt(Math.log1p(act) / Math.log1p(maxAct));
        const targetR = appeared > 0 ? R * (0.2 + 0.78 * (0.65 * (rank.get(b) ?? 1) + 0.35 * (1 - c))) : 0;
        const targetSize = appeared > 0 ? 2.2 + 13 * Math.sqrt(lerpAt(b.cum, t) / scene.maxCum) : 0;
        const targetAlpha = appeared * (0.28 + 0.72 * Math.min(1, c * 1.15));
        if (appeared > 0 && b.born === 0) b.born = clock;
        if (appeared === 0) b.born = 0;
        b.r += (targetR - b.r) * ease;
        b.size += (targetSize - b.size) * ease;
        b.alpha += (targetAlpha - b.alpha) * ease;
        const speed = 0.018 / (b.r / R + 0.35);
        const angle = b.angle0 + clock * speed;
        b.x = cx + Math.cos(angle) * b.r;
        b.y = cy + Math.sin(angle) * b.r * squash;
        if (b.alpha > 0.05) visible++;
      }
      // Soft separation so neighbours in a busy circle never sit on top of each other.
      const live = scene.bodies.filter((b) => b.alpha > 0.05);
      for (const b of live) {
        b.ox *= 0.97;
        b.oy *= 0.97;
      }
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const dx = b.x + b.ox - (a.x + a.ox);
          const dy = b.y + b.oy - (a.y + a.oy);
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.size + b.size + 7;
          if (d >= min) continue;
          const push = (min - d) * 0.12;
          a.ox -= (dx / d) * push;
          a.oy -= (dy / d) * push;
          b.ox += (dx / d) * push;
          b.oy += (dy / d) * push;
        }
      }
      for (const b of live) {
        const meDx = b.x + b.ox - cx;
        const meDy = b.y + b.oy - cy;
        const meD = Math.hypot(meDx, meDy) || 0.01;
        if (meD < 22 + b.size) {
          b.ox += (meDx / meD) * (22 + b.size - meD) * 0.2;
          b.oy += (meDy / meD) * (22 + b.size - meD) * 0.2;
        }
        b.x += b.ox;
        b.y += b.oy;
      }
      if (visible !== lastVisible) {
        lastVisible = visible;
        setVisibleCount(visible);
      }

      // nebulae: each member contributes a soft cloud in its circle's color
      ctx.globalCompositeOperation = "lighter";
      for (const b of scene.bodies) {
        if (!b.circle || b.alpha < 0.03) continue;
        const color = scene.circleColor.get(b.circle)!;
        const rad = 30 + b.size * 2;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
        g.addColorStop(0, color + "1c");
        g.addColorStop(1, color + "00");
        ctx.globalAlpha = Math.min(1, b.alpha * 1.1) * (sel && sel !== b.p.id ? 0.5 : 1);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // network edges
      for (const e of scene.edges) {
        const a = scene.bodies[e.a];
        const b = scene.bodies[e.b];
        const touched = sel && (a.p.id === sel || b.p.id === sel);
        const base = Math.min(a.alpha, b.alpha) * (0.04 + 0.2 * (e.w / scene.maxEdge));
        const alpha = sel ? (touched ? Math.min(0.75, base * 4 + 0.15) : base * 0.35) : base;
        if (alpha < 0.01) continue;
        ctx.strokeStyle = touched ? "rgba(255, 214, 160," + alpha + ")" : "rgba(220, 205, 255," + alpha + ")";
        ctx.lineWidth = touched ? 1.2 : 0.7;
        const mx = (a.x + b.x) / 2 + (cy - (a.y + b.y) / 2) * 0.12;
        const my = (a.y + b.y) / 2 + ((a.x + b.x) / 2 - cx) * 0.12;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
      }

      // tether to the selected body
      if (sel) {
        const b = scene.bodies.find((x) => x.p.id === sel);
        if (b) {
          const g = ctx.createLinearGradient(cx, cy, b.x, b.y);
          g.addColorStop(0, "rgba(255,226,180,0.5)");
          g.addColorStop(1, b.color + "aa");
          ctx.strokeStyle = g;
          ctx.setLineDash([2, 5]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // me
      const pulse = 1 + Math.sin(clock * 1.6) * 0.04;
      ctx.globalCompositeOperation = "lighter";
      const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70 * pulse);
      sun.addColorStop(0, "rgba(255, 236, 205, 0.9)");
      sun.addColorStop(0.18, "rgba(255, 196, 120, 0.45)");
      sun.addColorStop(0.5, "rgba(255, 140, 90, 0.12)");
      sun.addColorStop(1, "rgba(255, 120, 80, 0)");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(cx, cy, 70 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // bodies
      for (const b of scene.bodies) {
        if (b.alpha < 0.02 || b.size < 0.3) continue;
        const dim = sel && sel !== b.p.id ? 0.45 : 1;
        const halo = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size * 3.6);
        halo.addColorStop(0, b.color + "99");
        halo.addColorStop(0.3, b.color + "2e");
        halo.addColorStop(1, b.color + "00");
        ctx.globalAlpha = b.alpha * dim;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      for (const b of scene.bodies) {
        if (b.alpha < 0.02 || b.size < 0.3) continue;
        const dim = sel && sel !== b.p.id ? 0.45 : 1;
        ctx.globalAlpha = Math.min(1, b.alpha * 1.3) * dim;
        const core = ctx.createRadialGradient(b.x - b.size * 0.3, b.y - b.size * 0.3, 0, b.x, b.y, b.size);
        core.addColorStop(0, "#fffaf0");
        core.addColorStop(0.55, b.color);
        core.addColorStop(1, b.color + "99");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();
        if (b.born && clock - b.born < 1.2) {
          const k = (clock - b.born) / 1.2;
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.size + 4 + k * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (sel === b.p.id) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "#fff3e0";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.size + 6 + Math.sin(clock * 4) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // me core
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff6e6";
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "600 10px ui-sans-serif, -apple-system, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 240, 220, 0.75)";
      ctx.fillText("ME", cx, cy + 24);

      // labels: selection first, then newcomers and the brightest bodies, skipping any that would overlap
      const placed: [number, number, number, number][] = [[cx - 20, cy + 12, cx + 20, cy + 28]];
      const fits = (x0: number, y0: number, x1: number, y1: number) => {
        if (placed.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b)) return false;
        placed.push([x0, y0, x1, y1]);
        return true;
      };
      const isFresh = (b: Body) => b.born > 0 && clock - b.born < 1.6 && playingRef.current;
      const candidates = scene.bodies
        .filter((b) => b.alpha > 0.15 || sel === b.p.id)
        .sort((a, b) => Number(sel === b.p.id) - Number(sel === a.p.id) || Number(isFresh(b)) - Number(isFresh(a)) || b.size * b.alpha - a.size * a.alpha)
        .slice(0, w > 700 ? 26 : 14);
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      for (const b of candidates) {
        const mine = sel === b.p.id;
        ctx.font = (mine ? "600 13px" : "500 11.5px") + " ui-serif, 'New York', 'Iowan Old Style', Georgia, serif";
        const tw = ctx.measureText(b.p.name).width;
        const ly = b.y + b.size + 14;
        if (!fits(b.x - tw / 2 - 2, ly - 11, b.x + tw / 2 + 2, ly + 3) && !mine) continue;
        ctx.globalAlpha = sel && !mine ? 0.35 : isFresh(b) ? 1 : Math.min(1, b.alpha + 0.25);
        ctx.fillStyle = mine ? "#fff6e8" : "#f1e4d1";
        ctx.shadowBlur = 6;
        ctx.fillText(b.p.name, b.x, ly);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // circle names drift at their members' centroid
      ctx.font = "italic 400 11px ui-serif, 'New York', Georgia, serif";
      for (const [circle, color] of scene.circleColor) {
        const members = scene.bodies.filter((b) => b.circle === circle && b.alpha > 0.1);
        if (members.length < 2) continue;
        const mx = members.reduce((s, b) => s + b.x, 0) / members.length;
        const my = members.reduce((s, b) => s + b.y, 0) / members.length;
        const dx = mx - cx;
        const dy = my - cy;
        const len = Math.hypot(dx, dy) || 1;
        const title = model.group.get(circle)?.title ?? "";
        const text = title.length > 22 ? title.slice(0, 21) + "…" : title;
        const tw = ctx.measureText(text).width;
        const lx = Math.max(tw / 2 + 8, Math.min(w - tw / 2 - 8, mx + (dx / len) * 40));
        const ly = my + (dy / len) * 40;
        if (!fits(lx - tw / 2, ly - 10, lx + tw / 2, ly + 3)) continue;
        ctx.globalAlpha = sel ? 0.25 : 0.6;
        ctx.fillStyle = color;
        ctx.fillText(text, lx, ly);
      }
      ctx.globalAlpha = 1;
      canvas.dataset.ready = "1";
    };
    raf = requestAnimationFrame(frame);

    const pick = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let best: Body | null = null;
      let bestD = Infinity;
      for (const b of scene.bodies) {
        if (b.alpha < 0.08) continue;
        const d = Math.hypot(b.x - x, b.y - y) - b.size;
        if (d < 22 && d < bestD) [best, bestD] = [b, d];
      }
      const id = best ? best.p.id : null;
      selectedRef.current = id;
      setSelected(id);
      if (id) haptic();
    };
    canvas.addEventListener("pointerup", pick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerup", pick);
    };
  }, [scene, steps, model]);

  const togglePlay = () => {
    haptic();
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (tRef.current >= steps - 1.01) tRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
  };

  const person = selected ? model.person.get(selected) : null;
  const totalMessages = data.conversations.reduce((s, c) => s + c.messageCount, 0);
  const first = data.timeline.starts[0];
  const unitLabel = data.timeline.unit === "week" ? "Week of " : "";

  return (
    <div className="constellation">
      <canvas ref={canvasRef} className="sky" />
      <header className="sky-head">
        <p className="eyebrow">A living portrait</p>
        <h1>Your orbit</h1>
        <p className="sub">
          {data.people.filter((p) => p.total > 0).length} people · {fmtCount(totalMessages)} messages · since {fmtDate(first).replace(/ \d+,/, "")}
        </p>
        <button className="legend-toggle" onClick={() => setShowLegend((v) => !v)} aria-expanded={showLegend}>
          {Object.values(MOOD_COLORS).slice(0, 5).map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          <span>moods</span>
        </button>
        {showLegend && (
          <div className="legend" onClick={() => setShowLegend(false)}>
            {Object.entries(MOOD_COLORS).map(([m, c]) => (
              <span key={m}>
                <i style={{ background: c, boxShadow: "0 0 8px " + c }} />
                {m}
              </span>
            ))}
            <p>Closer = talking more lately. Bigger = more history. Clouds are group chats.</p>
          </div>
        )}
      </header>

      {person && (
        <button className="peek" onClick={() => onOpen(person.id)} style={{ ["--c" as string]: moodColor(person.mood) }}>
          <span className="peek-orb" />
          <span className="peek-text">
            <strong>{person.name}</strong>
            <small>
              {fmtCount(person.total)} messages{person.firstTs ? " · since " + fmtDate(person.firstTs) : ""}
              {person.mood ? " · mostly " + person.mood : ""}
            </small>
          </span>
          <span className="peek-go">{model.story.has(person.id) ? "Our story" : "Open"} →</span>
        </button>
      )}

      <div className="timebar">
        <button className={"play" + (playing ? " is-playing" : "")} onClick={togglePlay} aria-label={playing ? "Pause replay" : "Replay"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
          </svg>
        </button>
        <div className="time-track">
          <div className="time-label">
            <span className="when">
              {unitLabel}
              {data.timeline.labels[step]}
            </span>
            <span className="count">{visibleCount} in orbit</span>
          </div>
          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={steps - 1}
            step={0.01}
            defaultValue={0}
            aria-label="Time"
            onPointerDown={() => {
              playingRef.current = false;
              setPlaying(false);
            }}
            onInput={(e) => {
              tRef.current = Number((e.target as HTMLInputElement).value);
            }}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Math.abs(v - tRef.current) < 0.5) haptic();
            }}
          />
          <div className="ticks">
            <span>{data.timeline.labels[0]}</span>
            <span>{data.timeline.labels[steps - 1]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
