import { useEffect, useMemo, useState } from "react";

import { EMBEDDED, portraitFromHost, toHost } from "./bridge";
import { buildModel, haptic, type Model } from "./model";
import type { Portrait } from "./types";
import { Atlas } from "./views/Atlas";
import { Constellation } from "./views/Constellation";
import { Rivers } from "./views/Rivers";
import { StoryView } from "./views/Story";

type Tab = "orbit" | "rivers" | "atlas";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "orbit", label: "Orbit", icon: "M12 12m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0M3.5 12a8.5 4 -25 1 0 17 0a8.5 4 -25 1 0 -17 0" },
  { id: "rivers", label: "Rivers", icon: "M3 8c4-3 7 3 11 0s5-2 7-1M3 13c4-3 7 3 11 0s5-2 7-1M3 18c4-3 7 3 11 0s5-2 7-1" },
  { id: "atlas", label: "Atlas", icon: "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14" },
];

async function loadPortrait(): Promise<Portrait> {
  if (EMBEDDED) return portraitFromHost();
  if (!new URLSearchParams(location.search).has("demo")) {
    try {
      const res = await fetch("/portrait.json", { cache: "no-store" });
      if (res.ok && res.headers.get("content-type")?.includes("json")) return (await res.json()) as Portrait;
    } catch {
      // Fall through to the demo portrait.
    }
  }
  return (await import("../fixtures/demo-portrait.json")).default as unknown as Portrait;
}

function parseHash(): { tab: Tab; person: string | null; topic: string | null } {
  const [, tab, kind, id] = location.hash.split("/");
  return {
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : "orbit",
    person: kind === "p" && id ? decodeURIComponent(id) : null,
    topic: kind === "t" && id ? decodeURIComponent(id) : null,
  };
}

export function App() {
  const [data, setData] = useState<Portrait | null>(null);
  const [route, setRoute] = useState(parseHash);
  const model: Model | null = useMemo(() => (data ? buildModel(data) : null), [data]);

  useEffect(() => {
    loadPortrait().then(setData);
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (tab: Tab, person: string | null = null) => {
    const next = "#/" + tab + (person ? "/p/" + encodeURIComponent(person) : "");
    if (location.hash !== next) location.hash = next;
  };
  const openPerson = (id: string) => {
    haptic("medium");
    const person = model?.person.get(id);
    if (EMBEDDED && person) toHost({ type: "textrovert:open-person", personId: id, name: person.name });
    else go(route.tab, id);
  };

  if (!model) {
    return (
      <div className="boot">
        <div className="boot-orb" />
        <p>Gathering your stars…</p>
      </div>
    );
  }

  return (
    <div className={"app" + (EMBEDDED ? " embedded" : "")}>
      <main className="stage" key={route.tab}>
        {route.tab === "orbit" && <Constellation model={model} onOpen={openPerson} paused={route.person !== null} />}
        {route.tab === "rivers" && <Rivers model={model} onOpen={openPerson} />}
        {route.tab === "atlas" && <Atlas model={model} onOpen={openPerson} initialTopic={route.topic} />}
      </main>
      {route.person && model.person.has(route.person) && (
        <StoryView key={route.person} model={model} personId={route.person} onOpen={openPerson} onClose={() => history.length > 1 ? history.back() : go(route.tab)} />
      )}
      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={"tab" + (route.tab === t.id && !route.person ? " active" : "")}
            onClick={() => {
              haptic();
              go(t.id);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {model.data.synthetic && <div className="demo-badge">demo data</div>}
    </div>
  );
}
