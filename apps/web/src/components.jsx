import React from "react";
import { api, packToMarkdown } from "./api";

function withSilo(path, silo) {
  if (!silo) return path;
  return `${path}${path.includes("?") ? "&" : "?"}silo=${encodeURIComponent(silo)}`;
}

export function TierBadge({ tier }) {
  if (!tier) return null;
  return <span className={`badge tier-${tier}`}>{tier}</span>;
}

export function LayerBadge({ layer }) {
  return <span className={`badge layer-${layer}`}>{layer}</span>;
}

export function ProvenanceDrawer({ nodeId, onClose, silo }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    if (!nodeId) return;
    api(withSilo(`/nodes/${nodeId}`, silo)).then(setData).catch(() => setData(null));
  }, [nodeId, silo]);
  if (!nodeId) return null;
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Provenance</h3>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>
      {!data && <p className="muted">Loading...</p>}
      {data?.trace?.chain?.map((n) => (
        <article key={n.id} className="card compact">
          <LayerBadge layer={n.layer} /> <strong>{n.title}</strong>
          <p className="muted">{(n.content || "").slice(0, 140)}</p>
        </article>
      ))}
    </aside>
  );
}

export function RecallPanel({ compact = false, silo, live = false }) {
  const [query, setQuery] = React.useState("");
  const [pack, setPack] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [liveOn, setLiveOn] = React.useState(false);
  const [waitingLive, setWaitingLive] = React.useState(true);
  const [harnessMeta, setHarnessMeta] = React.useState(null);
  const [promptFeed, setPromptFeed] = React.useState([]);

  React.useEffect(() => {
    if (!live) return undefined;
    const source = new EventSource("/api/live/stream");

    function applyPromptEvent(event) {
      if (!event?.prompt) return;
      setWaitingLive(false);
      setQuery(event.prompt);
      if (event.pack) setPack(event.pack);
      setHarnessMeta({
        harness: event.harness,
        workspace: event.workspace,
        workspaceLabel: event.workspaceLabel,
        at: event.at,
      });
    }

    source.addEventListener("open", () => setLiveOn(true));
    source.addEventListener("error", () => setLiveOn(false));
    source.addEventListener("snapshot", (e) => {
      try {
        const snap = JSON.parse(e.data);
        setPromptFeed(snap.promptFeed || []);
        setWaitingLive(Boolean(snap.waitingForLive));
        if (!snap.waitingForLive && snap.lastPrompt) {
          applyPromptEvent({
            prompt: snap.lastPrompt,
            pack: snap.lastPack,
            harness: snap.harness,
            workspace: snap.workspace,
            workspaceLabel: snap.workspaceLabel,
            at: snap.lastEventAt,
          });
        }
      } catch {}
    });
    source.addEventListener("prompt", (e) => {
      try {
        const event = JSON.parse(e.data);
        applyPromptEvent(event);
        setPromptFeed((prev) => {
          const next = [
            {
              id: event.id,
              prompt: event.prompt,
              workspaceLabel: event.workspaceLabel,
              at: event.at,
            },
            ...prev.filter((p) => p.id !== event.id),
          ];
          return next.slice(0, 8);
        });
      } catch {}
    });

    return () => source.close();
  }, [live]);

  async function run(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const data = await api(withSilo("/recall", silo), {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    setPack(data.pack);
    setLoading(false);
  }

  return (
    <section className="stack">
      {live && (
        <div className="live-strip">
          <span className={liveOn ? "live-pill on" : "live-pill"}>
            {liveOn ? (waitingLive ? "Live · waiting for prompt" : "Live from harness") : "Connecting…"}
          </span>
          {harnessMeta?.harness && (
            <span className="muted">
              {harnessMeta.harness} · {harnessMeta.workspaceLabel || harnessMeta.workspace?.split(/[\\/]/).pop() || "workspace"}
            </span>
          )}
        </div>
      )}
      {live && waitingLive && !pack && (
        <p className="muted live-wait">Submit a prompt in any Cursor workspace — it will appear here automatically.</p>
      )}
      {live && promptFeed.length > 0 && (
        <div className="live-feed">
          {promptFeed.map((item) => (
            <button
              key={item.id}
              type="button"
              className="live-feed-item"
              onClick={() => {
                setQuery(item.prompt);
                setHarnessMeta({ workspaceLabel: item.workspaceLabel, at: item.at, harness: "cursor" });
              }}
            >
              <strong>{item.workspaceLabel || "repo"}</strong>
              <span>{item.prompt.slice(0, 64)}{item.prompt.length > 64 ? "…" : ""}</span>
            </button>
          ))}
        </div>
      )}
      <form className="row recall-form" onSubmit={run}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What are you working on?" />
        <button className="primary" type="submit" disabled={loading}>{loading ? "Recalling..." : "Recall"}</button>
      </form>
      {pack && (
        <div className="pack">
          <div className="pack-head">
            <span className="muted">{pack.capabilities.length} capabilities</span>
            <button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(packToMarkdown(pack))}>
              Copy context pack
            </button>
          </div>
          {(pack.cautions || []).map((c) => <div className="caution" key={c.conflictId}><strong>Contested:</strong> {c.summary}</div>)}
          {(pack.capabilities || []).map((c) => (
            <article key={c.id} className="cap-card">
              <strong>{c.title}</strong>
              <p>{c.content}</p>
              {c.whyItWorked && <p className="why">Why it worked: {c.whyItWorked}</p>}
            </article>
          ))}
          {!compact && (pack.claims || []).map((k) => (
            <article key={k.id} className="card">
              <TierBadge tier={k.sourceTier} /> {k.content}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function Inbox({ silo }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    api(withSilo("/inbox", silo)).then(setData).catch(() => setData({ queue: [], totals: {} }));
  }, [silo]);
  if (!data) return <p className="muted">Loading...</p>;
  const urgent = data.queue.filter((q) => q.priority >= 70);
  const review = data.queue.filter((q) => q.priority >= 40 && q.priority < 70);
  const backlog = data.queue.filter((q) => q.priority < 40);
  return (
    <section className="stack">
      <div className="stat-grid">
        <div className="stat"><span>Open</span><strong>{data.totals.open || 0}</strong></div>
        <div className="stat"><span>Conflicts</span><strong>{data.totals.conflicts || 0}</strong></div>
        <div className="stat"><span>Verification</span><strong>{data.totals.verification || 0}</strong></div>
      </div>
      <div className="kanban">
        {[["Urgent", urgent], ["Needs review", review], ["Backlog", backlog]].map(([label, items]) => (
          <section className="kanban-col" key={label}>
            <h3>{label}</h3>
            {items.map((item) => (
              <article className="ticket-card" key={item.id}>
                <span className={`badge issue-${item.type}`}>{item.type}</span>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function graphLayout(nodes, width, height) {
  const layers = ["memory", "knowledge", "wisdom"];
  const byLayer = { memory: [], knowledge: [], wisdom: [] };
  nodes.forEach((n) => byLayer[n.layer]?.push(n));
  const positions = new Map();
  layers.forEach((layer, li) => {
    const arr = byLayer[layer] || [];
    arr.forEach((n, i) => {
      positions.set(n.id, { x: ((li + 1) * width) / 4, y: ((i + 1) * height) / (arr.length + 1) });
    });
  });
  return positions;
}

export function GraphPage({ silo }) {
  const [data, setData] = React.useState(null);
  const [focus, setFocus] = React.useState("all");
  const [traceId, setTraceId] = React.useState("");
  React.useEffect(() => {
    api(withSilo("/graph", silo)).then(setData).catch(() => setData({ nodes: [], edges: [] }));
  }, [silo]);
  if (!data) return <p className="muted">Loading graph...</p>;
  const width = 920;
  const height = 460;
  const pos = graphLayout(data.nodes, width, height);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  return (
    <section className="stack">
      <div className="row">
        {["all", "memory", "knowledge", "wisdom"].map((l) => (
          <button key={l} type="button" className={focus === l ? "chip active" : "chip"} onClick={() => setFocus(l)}>{l}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="graph-svg">
        <rect x="0" y="0" width={width} height={height} fill="#121620" />
        {data.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const la = byId.get(e.from)?.layer;
          const lb = byId.get(e.to)?.layer;
          const dim = focus !== "all" && (la !== focus || lb !== focus);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={dim ? "rgba(255,255,255,.2)" : "rgba(113,180,255,.8)"} />;
        })}
        {data.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const dim = focus !== "all" && n.layer !== focus;
          const fill = n.layer === "memory" ? "#70a9ff" : n.layer === "knowledge" ? "#73d9a8" : "#efc26f";
          return (
            <g key={n.id} onClick={() => setTraceId(n.id)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r="8" fill={fill} opacity={dim ? ".25" : "1"} />
              <text x={p.x + 10} y={p.y + 4} fill={dim ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.85)"} fontSize="11">
                {n.title.slice(0, 26)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted">Silo scoped to: {silo}. Non-focused layers and links are dimmed.</p>
      <ProvenanceDrawer nodeId={traceId} onClose={() => setTraceId("")} silo={silo} />
    </section>
  );
}

export function Conflicts({ silo }) {
  const [conflicts, setConflicts] = React.useState([]);
  React.useEffect(() => {
    api(withSilo("/conflicts", silo)).then((d) => setConflicts(d.conflicts || [])).catch(() => setConflicts([]));
  }, [silo]);
  return (
    <section className="stack">
      {conflicts.map((c) => (
        <article key={c.id} className="conflict-card">
          <h3>{c.topic}</h3>
          <p>{c.summary}</p>
        </article>
      ))}
    </section>
  );
}

export function Sources() {
  const [sources, setSources] = React.useState([]);
  React.useEffect(() => { api("/sources").then((d) => setSources(d.sources || [])).catch(() => setSources([])); }, []);
  return <div className="card-grid">{sources.map((s) => <article key={s.id} className="card"><h3>{s.name}</h3><p className="muted">{s.status}</p></article>)}</div>;
}

export function Scopes() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => { api("/scopes").then(setData).catch(() => setData({ matrix: [] })); }, []);
  if (!data) return <p className="muted">Loading...</p>;
  return <section className="stack">{data.matrix.map((m) => <article key={m.classification} className="card"><strong>{m.classification}</strong><p className="muted">{m.note}</p></article>)}</section>;
}

export function Analytics({ silo, onNavigate }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    api(withSilo("/analytics", silo)).then(setData).catch(() => setData({ totals: {} }));
  }, [silo]);
  if (!data) return <p className="muted">Loading...</p>;

  const hottest = data.hottest || [];
  const gaps = data.gaps || [];
  const duplication = data.duplication || [];

  return (
    <section className="stack">
      <div className="stat-grid">
        <div className="stat"><span>Nodes</span><strong>{data.totals.nodes || 0}</strong></div>
        <div className="stat"><span>Capabilities</span><strong>{data.totals.capabilities || 0}</strong></div>
        <div className="stat"><span>Open conflicts</span><strong>{data.totals.openConflicts || 0}</strong></div>
        <div className="stat"><span>Queries logged</span><strong>{data.totals.queries || 0}</strong></div>
      </div>

      <article className="card">
        <h3>Hottest capabilities</h3>
        {hottest.length === 0 ? (
          <p className="muted">No recall heat yet.</p>
        ) : (
          <ul className="analytics-list">
            {hottest.map((n) => (
              <li key={n.id}>
                <strong>{n.title || n.id}</strong>
                <span className="muted">{n.hits || 0} hits · heat {n.heat || 0}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h3>Knowledge gaps</h3>
        <p className="muted">Recent queries with zero matching memory.</p>
        {gaps.length === 0 ? (
          <p className="muted">No gaps recorded.</p>
        ) : (
          <ul className="analytics-list">
            {gaps.map((q, i) => (
              <li key={`${q.at || i}-${q.query}`}>
                <strong>{q.query}</strong>
                <span className="muted">{q.at ? new Date(q.at).toLocaleString() : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h3>Duplication warnings</h3>
        <p className="muted">Capabilities with high token overlap across teams.</p>
        {duplication.length === 0 ? (
          <p className="muted">No duplication detected.</p>
        ) : (
          <ul className="analytics-list">
            {duplication.slice(0, 8).map((d, i) => (
              <li key={`${d.a?.id}-${d.b?.id}-${i}`}>
                <strong>{d.overlap}% overlap</strong>
                <span className="muted">{d.a?.title} ({d.a?.team}) ↔ {d.b?.title} ({d.b?.team})</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {(data.totals.openConflicts || 0) > 0 && onNavigate && (
        <button type="button" className="ghost" onClick={() => onNavigate("conflicts")}>
          View open conflicts →
        </button>
      )}
    </section>
  );
}

export function Install() {
  return <article className="card"><h3>Install MCP</h3><p>Connect Engrammic MCP in Cursor, Claude Code, or Codex.</p></article>;
}
