import { area, curveMonotoneX, line } from "d3-shape";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { fmtCount, fmtDate, fmtShort, fmtTime, haptic, initials, meaningfulTopics, moodColor, type Model } from "../model";
import type { PlanRef, Receipt } from "../types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

interface SheetState {
  title: string;
  subtitle?: string;
  ids: number[];
  episodes?: number[];
}

export function StoryView({ model, personId, onOpen, onClose }: { model: Model; personId: string; onOpen: (id: string) => void; onClose: () => void }) {
  const p = model.person.get(personId)!;
  const story = model.story.get(personId);
  const color = moodColor(p.mood);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [allPlans, setAllPlans] = useState(false);

  const plans = useMemo(() => {
    const today = new Date(model.now).toISOString().slice(0, 10);
    const seen = new Set<string>();
    const unique = p.plans.filter((pl) => {
      const key = pl.what.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const upcoming = unique.filter((pl) => pl.date && pl.date >= today).sort((a, b) => a.date!.localeCompare(b.date!));
    const past = unique.filter((pl) => !upcoming.includes(pl)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.ts - a.ts);
    return { upcoming, past };
  }, [p, model.now]);

  const mutuals = useMemo(() => {
    const score = new Map<string, number>();
    for (const e of model.data.edges) {
      if (e.a === p.id) score.set(e.b, (score.get(e.b) ?? 0) + e.weight);
      if (e.b === p.id) score.set(e.a, (score.get(e.a) ?? 0) + e.weight);
    }
    return [...score]
      .map(([id, s]) => ({ q: model.person.get(id)!, s }))
      .filter(({ q }) => q && q.total > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(({ q }) => q);
  }, [p, model]);

  const moments = useMemo(
    () =>
      [...p.episodes]
        .map((id) => model.episode.get(id)!)
        .filter(Boolean)
        .sort((a, b) => b.start - a.start)
        .slice(0, 6),
    [p, model],
  );

  const moodTotal = p.moods.reduce((s, [, n]) => s + n, 0);
  const topics = meaningfulTopics(p.topics);
  const topicMax = Math.max(1, ...topics.map(([, n]) => n));
  let footnote = 0;

  const openSheet = (s: SheetState) => {
    haptic();
    setSheet(s);
  };

  const planRow = (pl: PlanRef, upcoming: boolean) => (
    <li key={pl.episode + pl.what}>
      <button
        className={"plan" + (upcoming ? " upcoming" : "")}
        onClick={() => openSheet({ title: pl.what, subtitle: pl.when || (pl.date ?? ""), ids: pl.sources })}
      >
        <span className="plan-date">
          {pl.date ? (
            <>
              <b>{new Date(pl.date + "T12:00:00").toLocaleDateString("en-US", { day: "numeric" })}</b>
              <small>{new Date(pl.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</small>
            </>
          ) : (
            <small>{fmtShort(pl.ts)}</small>
          )}
        </span>
        <span className="plan-body">
          <span className="plan-what">{pl.what}</span>
          <span className="plan-meta">
            {[pl.when, model.conversation.get(pl.conversation)?.title].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="plan-receipt" aria-hidden="true">
          ❝
        </span>
      </button>
    </li>
  );

  const shownPlans = allPlans ? [...plans.upcoming, ...plans.past] : [...plans.upcoming.slice(0, 4), ...plans.past.slice(0, Math.max(0, 5 - Math.min(4, plans.upcoming.length)))];

  return (
    <div className="story-layer" role="dialog" aria-label={"Story of you and " + p.name}>
      <div className="story-scroll">
        <header className="story-hero" style={{ ["--c" as string]: color }}>
          <button className="back" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="hero-orb">
            <span>{initials(p.name)}</span>
          </div>
          <p className="eyebrow">The story of us</p>
          <h1>{p.name}</h1>
          <p className="since">
            {p.firstTs ? "Since " + fmtDate(p.firstTs) : "No messages yet"} · {fmtCount(p.total)} messages
            {p.dm ? "" : " · groups only"}
          </p>
          {story?.headline && <p className="headline">“{story.headline}”</p>}
          <Sparkline model={model} personId={p.id} />
        </header>

        <div className="story-body">
          {story ? (
            <section className="chapters">
              {story.chapters.map((c, i) => (
                <article className="chapter" key={i} style={{ animationDelay: 80 + i * 70 + "ms" }}>
                  <div className="chapter-head">
                    <span className="numeral">{ROMAN[i] ?? i + 1}</span>
                    <div>
                      <h2>{c.title}</h2>
                      <p className="period">{c.period}</p>
                    </div>
                  </div>
                  <p className="prose">
                    {c.sentences.map((s, j) => {
                      footnote++;
                      const n = footnote;
                      return (
                        <span key={j}>
                          {s.text}
                          <button
                            className="fn"
                            onClick={() => openSheet({ title: "Receipt " + n, subtitle: c.title + " · " + c.period, ids: s.refs, episodes: s.episodes })}
                            aria-label={"Show the messages behind footnote " + n}
                          >
                            {n}
                          </button>{" "}
                        </span>
                      );
                    })}
                  </p>
                </article>
              ))}
            </section>
          ) : (
            <section className="no-story">
              <p>No memoir written yet: memoirs are drafted for your closest orbits. Here are your latest moments instead.</p>
            </section>
          )}

          {(plans.upcoming.length > 0 || plans.past.length > 0) && (
            <Section title="Plans you made" note={plans.upcoming.length ? plans.upcoming.length + " upcoming" : undefined}>
              <ul className="plans">{shownPlans.map((pl) => planRow(pl, plans.upcoming.includes(pl)))}</ul>
              {plans.upcoming.length + plans.past.length > shownPlans.length && (
                <button className="more" onClick={() => setAllPlans(true)}>
                  All {plans.upcoming.length + plans.past.length} plans
                </button>
              )}
            </Section>
          )}

          {topics.length > 0 && (
            <Section title="What you talk about">
              <div className="topics">
                {topics.map(([t, n]) => (
                  <span key={t} className="topic" style={{ ["--w" as string]: 0.35 + 0.65 * (n / topicMax) }}>
                    {t}
                    <small>{n}</small>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {moodTotal > 0 && (
            <Section title="The mood between you">
              <div className="moodbar">
                {p.moods.map(([m, n]) => (
                  <span key={m} style={{ flex: n, background: moodColor(m) }} title={m} />
                ))}
              </div>
              <div className="moodkeys">
                {p.moods.slice(0, 5).map(([m, n]) => (
                  <span key={m}>
                    <i style={{ background: moodColor(m) }} />
                    {m} <small>{Math.round((n / moodTotal) * 100)}%</small>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {moments.length > 0 && (
            <Section title="Recent moments">
              <ul className="moments">
                {moments.map((e) => (
                  <li key={e.id}>
                    <i style={{ background: moodColor(e.mood) }} />
                    <div>
                      <strong>{e.title}</strong>
                      <p>{e.summary}</p>
                      <small>
                        {fmtDate(e.start)} · {model.conversation.get(e.conversation)?.title}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {p.groups.length > 0 && (
            <Section title="Shared circles">
              <ul className="circles">
                {p.groups
                  .map((g) => model.group.get(g)!)
                  .filter(Boolean)
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 8)
                  .map((g) => (
                    <li key={g.id}>
                      <span>{g.title}</span>
                      <small>
                        {g.members.length + 1} people · {fmtCount(g.total)} msgs
                      </small>
                    </li>
                  ))}
              </ul>
            </Section>
          )}

          {mutuals.length > 0 && (
            <Section title="Mutual orbits">
              <div className="mutuals">
                {mutuals.map((q) => (
                  <button key={q.id} className="chip" onClick={() => onOpen(q.id)} style={{ ["--c" as string]: moodColor(q.mood) }}>
                    <i />
                    {q.name}
                  </button>
                ))}
              </div>
            </Section>
          )}
          <p className="colophon">Every footnote opens the messages it came from.</p>
        </div>
      </div>
      {sheet && createPortal(<ReceiptSheet model={model} sheet={sheet} friend={p.name} onClose={() => setSheet(null)} />, document.body)}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="section">
      <h3>
        {title}
        {note && <small>{note}</small>}
      </h3>
      {children}
    </section>
  );
}

function Sparkline({ model, personId }: { model: Model; personId: string }) {
  const p = model.person.get(personId)!;
  const W = 320;
  const H = 54;
  const n = p.dmThem.length;
  const them = p.dmThem.map((v, i) => v + p.groupThem[i]);
  const max = Math.max(1, ...them.map((v, i) => v + p.dmMe[i]));
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 4);
  const themArea = area<number>().x((_, i) => x(i)).y0(H).y1((v) => y(v)).curve(curveMonotoneX);
  const meArea = area<number>().x((_, i) => x(i)).y0((_, i) => y(them[i])).y1((v, i) => y(them[i] + v)).curve(curveMonotoneX);
  const meLine = line<number>().x((_, i) => x(i)).y((v, i) => y(them[i] + v)).curve(curveMonotoneX);
  const labels = model.data.timeline.labels;
  return (
    <figure className="spark">
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" aria-label="Messages over time">
        <defs>
          <linearGradient id="spark-them" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--c)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path d={themArea(them) ?? ""} fill="url(#spark-them)" />
        <path d={meArea(p.dmMe) ?? ""} fill="#fff1dc" opacity="0.12" />
        <path d={meLine(p.dmMe) ?? ""} fill="none" stroke="#fff1dc" strokeWidth="1.2" opacity="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>{labels[0]}</span>
        <span className="key">
          <i style={{ background: "var(--c)" }} /> them <i style={{ background: "#fff1dc" }} /> you
        </span>
        <span>{labels[labels.length - 1]}</span>
      </figcaption>
    </figure>
  );
}

function ReceiptSheet({ model, sheet, friend, onClose }: { model: Model; sheet: SheetState; friend: string; onClose: () => void }) {
  const receipts = sheet.ids.map((id) => model.data.receipts[id]).filter((r): r is Receipt => !!r).sort((a, b) => a.ts - b.ts);
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };
  return (
    <div className={"sheet-backdrop" + (closing ? " closing" : "")} onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Receipts">
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <p className="eyebrow">Receipts</p>
            <h4>{sheet.title}</h4>
            {sheet.subtitle && <p className="sheet-sub">{sheet.subtitle}</p>}
          </div>
          <button className="sheet-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        {(sheet.episodes ?? []).map((id) => {
          const e = model.episode.get(id);
          if (!e) return null;
          return (
            <div className="moment-card" key={id} style={{ ["--c" as string]: moodColor(e.mood) }}>
              <small>
                The moment · {fmtDate(e.start)} · {model.conversation.get(e.conversation)?.title}
              </small>
              <strong>{e.title}</strong>
              <p>{e.summary}</p>
            </div>
          );
        })}
        <ul className="receipts">
          {receipts.map((r) => (
            <li key={r.id} className={r.sender === "Me" ? "mine" : ""}>
              <div className="bubble">{r.text}</div>
              <small>
                {r.sender} · {fmtTime(r.ts)} · {r.conversation === friend ? "your DMs" : r.conversation}
              </small>
            </li>
          ))}
          {receipts.length === 0 && <li className="empty">These messages aren't included in this portrait.</li>}
        </ul>
      </div>
    </div>
  );
}
