const API = "/api";
const LAYER_COLOR = { memory: "var(--layer-memory)", knowledge: "var(--layer-knowledge)", wisdom: "var(--layer-wisdom)" };
const LAYER_COLOR_HEX = { memory: "#5a8fc7", knowledge: "#4a9b6e", wisdom: "#c9a042" };

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Edge app / restricted storage — ignore
  }
}

function readSessionStorage(key, fallback = "") {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSessionStorage(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const LIVE_SESSION_KEY = "aabw.live.session";

const state = {
  user: null,
  page: "live",
  silo: null,
  liveOn: false,
  liveEvents: [],
  graphData: null,
  graphFocus: "all",
  graphSelection: null,
  graphHover: null,
  graphTransform: { x: 0, y: 0, k: 1 },
  graphDrag: null,
  liveSource: null,
  signingOut: false,
  graphRefreshTimer: null,
  graphPollTimer: null,
  lastGraphVersion: 0,
  graphDragMoved: false,
  sidebarCollapsed: readStorage("aabw.sidebar") === "1",
  graphLoading: false,
  loadProgress: 0,
  loadTimer: null,
  graphResizeObs: null,
  shellResizeObs: null,
  shellResizeTimer: null,
  graphLayoutCache: null,
  graphLayoutStableKey: null,
  graphHoverId: null,
  graphHoverTimer: null,
  pendingGraphRefresh: false,
  graphMouseupHandler: null,
  provenanceNodeId: null,
  provenanceData: null,
  promptFeed: [],
  selectedLiveId: null,
  dismissedSuggestions: new Set(),
  harnessSessionId: null,
};

const NAV_ITEMS = [
  { id: "live", label: "Live", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/></svg>' },
  { id: "ingest", label: "Ingest", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h7M8 5l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 3v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/></svg>' },
  { id: "graph", label: "Graph", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="3" cy="4" r="1.3" fill="currentColor" opacity="0.7"/><circle cx="13" cy="4" r="1.3" fill="currentColor" opacity="0.7"/><circle cx="3" cy="12" r="1.3" fill="currentColor" opacity="0.55"/><circle cx="13" cy="12" r="1.3" fill="currentColor" opacity="0.55"/><path d="M4.2 4.6L6.8 7M11.8 4.6L9.2 7M4.2 11.4L6.8 9M11.8 11.4L9.2 9" stroke="currentColor" stroke-width="0.8" opacity="0.35"/></svg>' },
  { id: "inbox", label: "Inbox", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="12" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 6.5h12L9.5 9.5H6.5L2 6.5z" fill="currentColor" opacity="0.35"/></svg>' },
];

const PAGE_LABELS = Object.fromEntries(NAV_ITEMS.map((n) => [n.id, n.label]));
const GRAPH_LAYOUT = { width: 920, height: 680 };

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

function timeShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function packItems(pack) {
  if (!pack || pack.source === "local-demo") return [];
  const items = [
    ...(pack.capabilities || []).map((n) => ({ ...n, layer: n.layer || "knowledge", kind: "capability" })),
    ...(pack.claims || []).map((n) => ({ ...n, layer: n.layer || "knowledge", kind: "claim" })),
    ...(pack.beliefs || []).map((n) => ({ ...n, layer: n.layer || "wisdom", kind: "belief" })),
    ...(pack.observations || []).map((n) => ({ ...n, layer: n.layer || "memory", kind: "observation" })),
  ].filter((n) => n.id && String(n.id).trim());
  const seen = new Set();
  return items.filter((n) => {
    const key = n.id || n.title || n.content;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function isLivePack(pack, source) {
  const src = source || pack?.source;
  return src !== "local-demo";
}

function persistLiveSession() {
  writeSessionStorage(
    LIVE_SESSION_KEY,
    JSON.stringify({
      liveEvents: state.liveEvents,
      selectedLiveId: state.selectedLiveId,
      harnessSessionId: state.harnessSessionId,
      dismissedSuggestions: [...state.dismissedSuggestions],
    })
  );
}

function restoreLiveSession() {
  try {
    const raw = readSessionStorage(LIVE_SESSION_KEY, "");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.liveEvents) && data.liveEvents.length) {
      state.liveEvents = mergeLiveEvents(data.liveEvents);
    }
    if (data.selectedLiveId) state.selectedLiveId = data.selectedLiveId;
    if (data.harnessSessionId) state.harnessSessionId = data.harnessSessionId;
    if (Array.isArray(data.dismissedSuggestions)) {
      state.dismissedSuggestions = new Set(data.dismissedSuggestions);
    }
  } catch {
    // ignore corrupt session blob
  }
}

function promptPreview(text, max = 72) {
  const t = String(text || "").trim();
  if (!t) return "Cursor prompt";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function packToMarkdown(pack) {
  if (!pack) return "";
  const lines = [`# Context pack — "${pack.query || "recall"}"`, ""];
  for (const c of pack.capabilities || []) {
    lines.push(`### ${c.title || "Capability"}`);
    if (c.content) lines.push(c.content);
    if (c.whyItWorked) lines.push(`*Why it worked:* ${c.whyItWorked}`);
    lines.push("");
  }
  for (const b of pack.beliefs || []) lines.push(`- ${b.content || b.title}`);
  for (const k of pack.claims || []) lines.push(`- ${k.content || k.title}`);
  for (const c of pack.cautions || []) lines.push(`- CONTESTED: ${c.summary || c.topic}`);
  lines.push(`_Engrammic Org Memory · ${pack.generatedAt || new Date().toISOString()}_`);
  return lines.join("\n");
}

function offCorpusHint(pack, mcpError) {
  if (mcpError) return { title: "Off live corpus", detail: mcpError };
  const items = packItems(pack);
  if (!items.length && (pack?.deniedCount || 0) > 0) {
    return { title: "Scope-limited recall", detail: "Relevant memory exists but is withheld by role scope." };
  }
  if (!items.length) {
    return { title: "Off corpus", detail: "No matching memory for this query — topic may be outside org knowledge." };
  }
  return null;
}

function renderOodBanner(parent, hint) {
  if (!hint) return;
  const banner = el("div", "ood-banner");
  banner.innerHTML = `<strong>${hint.title}</strong><p>${hint.detail}</p>`;
  parent.prepend(banner);
}

function formatConfidencePct(itemOrNum) {
  if (itemOrNum == null) return null;
  if (typeof itemOrNum === "number") {
    const n = itemOrNum <= 1 ? itemOrNum * 100 : itemOrNum;
    return Math.round(n);
  }
  if (itemOrNum.confidence != null) return Math.round(Number(itemOrNum.confidence) * 100);
  if (itemOrNum.credibility != null) return Math.round(Number(itemOrNum.credibility) * 100);
  return null;
}

function sourceLabel(source) {
  if (source === "engrammic-mcp") return "engrammic-mcp";
  if (source === "local-demo") return "local-demo";
  return source || "recall";
}

async function focusCompanionWindow() {
  try {
    await fetch("/focus");
  } catch {
    // optional surface
  }
}

function feedKey(at, prompt) {
  return `${at}:${prompt}`;
}

function eventFromPromptPayload(e) {
  return {
    id: e.id,
    at: e.at,
    prompt: e.prompt,
    harness: e.harness,
    workspaceLabel: e.workspaceLabel,
    pack: e.pack,
    source: e.source || e.pack?.source,
    mcpError: e.mcpError,
    suggestion: e.suggestion,
    pending: Boolean(e.pending),
  };
}

function mergeLiveEvents(incoming) {
  const merged = new Map();
  for (const e of [...incoming, ...state.liveEvents]) {
    if (!e?.prompt) continue;
    const key = e.id || feedKey(e.at, e.prompt);
    const prev = merged.get(key);
    if (!prev || (e.pack && !prev.pack) || (prev.pending && !e.pending)) merged.set(key, e);
  }
  return [...merged.values()].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
}

function hydrateFromSnapshot(snap) {
  if (!snap) return;
  state.promptFeed = snap.promptFeed || [];
  if (snap.sessionId) state.harnessSessionId = snap.sessionId;

  const fromHistory = (snap.promptHistory || [])
    .filter((h) => h?.pending || (h?.pack && isLivePack(h.pack, h.source)))
    .map((h) =>
      eventFromPromptPayload({
        id: h.id,
        at: h.at,
        prompt: h.prompt,
        harness: h.harness,
        workspaceLabel: h.workspaceLabel,
        pack: h.pack,
        source: h.source || h.pack?.source,
        mcpError: h.mcpError,
        suggestion: h.suggestion,
        pending: h.pending,
      })
    );

  if (fromHistory.length) {
    state.liveEvents = mergeLiveEvents(fromHistory);
  } else if (!snap.waitingForLive && snap.lastPack && isLivePack(snap.lastPack)) {
    state.liveEvents = mergeLiveEvents([
      {
        id: "snapshot",
        at: snap.lastEventAt,
        prompt: snap.lastPrompt,
        harness: snap.harness,
        workspaceLabel: snap.workspaceLabel,
        pack: snap.lastPack,
        source: snap.lastPack?.source,
        suggestion: snap.lastSuggestion,
      },
    ]);
  }

  if (!state.selectedLiveId && state.liveEvents[0]?.id) {
    state.selectedLiveId = state.liveEvents[0].id;
  }
  persistLiveSession();
}

async function loadLiveState() {
  try {
    const res = await fetch("/state");
    const snap = await res.json();
    hydrateFromSnapshot(snap);
    renderLiveTimeline();
    renderLiveDetail();
  } catch {
    // gateway may be warming
  }
}

function ensureWhyDrawer(appEl) {
  let drawer = document.getElementById("why-drawer");
  if (!drawer) {
    drawer = el("aside", "why-drawer hidden");
    drawer.id = "why-drawer";
    drawer.innerHTML =
      '<div class="why-drawer-head"><h3>Why?</h3><button type="button" class="chip icon-chip" id="why-drawer-close" title="Close">×</button></div><div id="why-drawer-body" class="why-drawer-body"><p class="muted">Click a recalled item to see provenance.</p></div>';
    appEl.appendChild(drawer);
    drawer.querySelector("#why-drawer-close")?.addEventListener("click", closeProvenanceDrawer);
  } else if (drawer.parentElement !== appEl) {
    appEl.appendChild(drawer);
  }
  drawer.classList.toggle("hidden", !state.provenanceNodeId);
}

function openWhyDrawer(nodeId) {
  state.provenanceNodeId = nodeId;
  document.getElementById("why-drawer")?.classList.remove("hidden");
  loadProvenance(nodeId);
}

function dedupeProvenanceChain(chain, headId) {
  const seen = new Set();
  const out = [];
  for (const n of chain || []) {
    const id = n?.id;
    if (!id || id === headId || seen.has(id)) continue;
    seen.add(id);
    out.push(n);
  }
  return out;
}

function traceFromGraph(nodeId, nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain = [];
  const seen = new Set();
  const walk = (id, depth) => {
    if (!id || seen.has(id) || depth > 6) return;
    seen.add(id);
    const n = byId.get(id);
    if (n) chain.push(n);
    for (const e of edges || []) {
      const t = (e.type || "").toUpperCase();
      if (e.from === id && (t.includes("DERIVED") || t.includes("SYNTHESIZED") || t === "SUPPORTS")) walk(e.to, depth + 1);
      if (e.to === id && t.includes("DERIVED")) walk(e.from, depth + 1);
    }
  };
  walk(nodeId, 0);
  return chain;
}

async function signOut() {
  if (state.signingOut) return;
  state.signingOut = true;

  disconnectLive();
  state.user = null;
  state.liveEvents = [];
  state.graphData = null;
  state.dismissedSuggestions = new Set();
  try {
    sessionStorage.removeItem(LIVE_SESSION_KEY);
  } catch {
    // ignore
  }

  document.getElementById("app")?.classList.add("hidden");
  const loginRoot = document.getElementById("login");
  loginRoot.classList.remove("hidden");
  loginRoot.innerHTML = '<div class="login-card"><p class="eyebrow">Engrammic</p><h1>Org Memory</h1><p class="lede muted">Signing out…</p></div>';

  try {
    await api("/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Still show login — session may already be cleared client-side.
  }

  document.cookie = "aabw_session=; Path=/; Max-Age=0; SameSite=Lax";
  state.signingOut = false;

  try {
    const personas = await api("/auth/personas");
    renderLogin(personas.personas || []);
  } catch {
    loginRoot.innerHTML = "";
    const card = el("div", "login-card");
    card.innerHTML = `<p class="eyebrow">Engrammic</p><h1>Org Memory</h1><p class="lede muted">Signed out.</p>`;
    loginRoot.appendChild(card);
    setTimeout(() => init(), 800);
  }
}

function stopGraphPolling() {
  if (state.graphPollTimer) {
    clearInterval(state.graphPollTimer);
    state.graphPollTimer = null;
  }
  if (state.graphRefreshTimer) {
    clearTimeout(state.graphRefreshTimer);
    state.graphRefreshTimer = null;
  }
  if (state.graphMouseupHandler) {
    window.removeEventListener("mouseup", state.graphMouseupHandler);
    state.graphMouseupHandler = null;
  }
}

function disconnectLive() {
  stopGraphPolling();
  if (state.liveSource) {
    state.liveSource.close();
    state.liveSource = null;
  }
  state.liveOn = false;
}

function scheduleGraphRefresh(force = false) {
  if (state.page !== "graph") return;
  if (state.graphRefreshTimer) clearTimeout(state.graphRefreshTimer);
  state.graphRefreshTimer = setTimeout(() => {
    state.graphRefreshTimer = null;
    loadGraph(force, true);
  }, 180);
}

function startGraphPolling() {
  if (state.graphPollTimer) return;
  state.graphPollTimer = setInterval(() => {
    if (state.page === "graph" && state.user) loadGraph(false, true);
  }, 30_000);
}

function renderLogin(personas) {
  const root = document.getElementById("login");
  root.classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  root.innerHTML = "";
  const card = el("div", "login-card");
  card.innerHTML = `
    <p class="eyebrow">Engrammic</p>
    <h1>Org Memory</h1>
    <p class="lede">Sign in to scope org memory beside your harness.</p>
  `;
  const list = el("div", "persona-list");
  for (const p of personas) {
    const btn = el("button");
    btn.innerHTML = `<strong>${p.fullName}</strong><span>${p.role} · ${p.department}</span>`;
    btn.onclick = async () => {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ personaId: p.userId }) });
      state.user = data.user;
      await bootApp();
    };
    list.appendChild(btn);
  }
  card.appendChild(list);
  root.appendChild(card);
}

function shellLayoutProfile(width, height) {
  const aspect = width / Math.max(height, 1);
  let size = "md";
  if (width < 360) size = "xs";
  else if (width < 480) size = "sm";
  else if (width < 640) size = "md";
  else if (width < 840) size = "lg";
  else size = "xl";

  let aspectKey = "square";
  if (aspect < 0.82) aspectKey = "portrait";
  else if (aspect > 1.18) aspectKey = "landscape";

  let density = "normal";
  if (width < 400 || (width < 520 && height < 480)) density = "compact";
  else if (width >= 840 && height >= 560) density = "comfortable";

  return { size, aspect: aspectKey, density, width, height };
}

function applyShellLayout(appEl, width, height) {
  const profile = shellLayoutProfile(width, height);
  appEl.dataset.shellWidth = String(Math.round(width));
  appEl.dataset.shellHeight = String(Math.round(height));
  appEl.dataset.shellSize = profile.size;
  appEl.dataset.shellAspect = profile.aspect;
  appEl.dataset.shellDensity = profile.density;

  appEl.classList.toggle("shell-narrow", width < 480);
  appEl.classList.toggle("shell-portrait", profile.aspect === "portrait");
  appEl.classList.toggle("shell-landscape", profile.aspect === "landscape");
  appEl.classList.toggle("shell-square", profile.aspect === "square");
  appEl.classList.toggle("shell-tall", height >= 620);
  appEl.classList.toggle("shell-short", height < 420);

  appEl.classList.remove("density-compact", "density-normal", "density-comfortable");
  appEl.classList.add(`density-${profile.density}`);
}

function renderShell() {
  const app = document.getElementById("app");
  app.className = `app${state.sidebarCollapsed ? " sidebar-collapsed" : ""}`;
  app.classList.remove("hidden");
  document.getElementById("login").classList.add("hidden");
  app.innerHTML = "";

  const sidebar = el("aside", "sidebar");

  const sidebarHead = el("div", "sidebar-head");
  const brand = el("div", "sidebar-brand");
  brand.innerHTML = `<p class="eyebrow">Engrammic</p><h1>Org Memory</h1>`;
  sidebarHead.appendChild(brand);

  const toggle = el("button", "sidebar-toggle");
  toggle.type = "button";
  toggle.title = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.innerHTML = state.sidebarCollapsed
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3L5 8l6 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  toggle.onclick = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    writeStorage("aabw.sidebar", state.sidebarCollapsed ? "1" : "0");
    renderShell();
  };
  sidebarHead.appendChild(toggle);
  sidebar.appendChild(sidebarHead);

  const nav = el("nav", "nav");
  for (const item of NAV_ITEMS) {
    const btn = el("button", state.page === item.id ? "active" : "");
    btn.type = "button";
    btn.title = item.label;
    btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span>`;
    btn.onclick = () => {
      if (item.id === "live") restoreLiveSession();
      if (state.page === "graph" && item.id !== "graph") stopGraphPolling();
      state.page = item.id;
      renderShell();
      if (item.id === "live") {
        renderLiveTimeline();
        renderLiveDetail();
      }
      if (item.id === "inbox") loadInbox();
      if (item.id === "ingest") loadIngestPage();
      if (item.id === "graph") {
        loadGraph(false);
        startGraphPolling();
      }
    };
    nav.appendChild(btn);
  }
  sidebar.appendChild(nav);

  const foot = el("div", "sidebar-foot");
  foot.innerHTML = `<div class="sidebar-user"><strong>${state.user.fullName}</strong><span class="muted">${state.user.role} · ${state.user.department}</span></div>`;
  const out = el("button", "ghost", "Sign out");
  out.type = "button";
  out.disabled = state.signingOut;
  out.onclick = () => signOut();
  foot.appendChild(out);
  sidebar.appendChild(foot);

  const main = el("main", "main");
  const head = el("div", "main-head");
  const headLeft = el("div", "main-head-left");
  headLeft.innerHTML = `<h2>${PAGE_LABELS[state.page] || state.page}</h2>`;
  head.appendChild(headLeft);

  const headTools = el("div", "head-tools");
  const status = el("span", state.liveOn ? "pill live" : "pill", state.liveOn ? "live" : "·");
  status.id = "conn-pill";
  headTools.appendChild(status);
  head.appendChild(headTools);
  main.appendChild(head);

  const banner = el("div", "banner error hidden");
  banner.id = "banner-global";
  main.appendChild(banner);

  const content = el("div", "content");
  if (state.page === "live") content.appendChild(renderLivePage());
  if (state.page === "ingest") content.appendChild(renderIngestPage());
  if (state.page === "graph") content.appendChild(renderGraphPage());
  if (state.page === "inbox") {
    const inbox = el("div", "panel");
    inbox.id = "inbox-root";
    inbox.innerHTML = '<p class="muted">Loading…</p>';
    content.appendChild(inbox);
  }
  main.appendChild(content);

  app.appendChild(sidebar);
  app.appendChild(main);
  ensureWhyDrawer(app);
  ensureLoadBar();
  bindShellResize(app);
  if (state.provenanceNodeId) {
    setTimeout(() => loadProvenance(state.provenanceNodeId), 0);
  }
}

function bindShellResize(appEl) {
  if (!appEl) return;
  if (state.shellResizeObs) state.shellResizeObs.disconnect();
  let timer = null;
  state.shellResizeObs = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    applyShellLayout(appEl, width, height);
    if (state.page === "graph" && state.graphData?.nodes?.length) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const g = document.querySelector("#graph-stage svg g");
        if (g) {
          g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
        }
      }, 100);
    }
  });
  state.shellResizeObs.observe(appEl);
  const rect = appEl.getBoundingClientRect();
  applyShellLayout(appEl, rect.width, rect.height);
}

function renderIngestPage() {
  const wrap = el("div", "ingest-page");
  const intro = el("p", "muted ingest-intro");
  intro.textContent =
    "Auto-ingest engineering knowledge from Gmail. Paste runbooks, ADRs, or notes — claims are extracted automatically into Engrammic.";
  wrap.appendChild(intro);

  const connectors = el("div", "ingest-connectors");
  connectors.id = "ingest-connectors";
  connectors.innerHTML = '<p class="muted">Loading connectors…</p>';
  wrap.appendChild(connectors);

  const docPanel = el("div", "ingest-panel panel");
  docPanel.innerHTML = "<h3>Paste documentation</h3>";
  const form = el("form", "ingest-form");
  form.id = "ingest-form";
  form.innerHTML = `
    <label class="muted">Label <span class="optional">(optional)</span><input type="text" name="label" placeholder="ADR-042 Postgres migration" maxlength="120" /></label>
    <label class="muted">Document text<textarea name="text" required rows="10" placeholder="Paste runbook, postmortem, ADR, or engineering notes…"></textarea></label>
    <button type="submit" class="chip active">Extract &amp; ingest</button>
    <p class="ingest-status muted" id="ingest-status"></p>
  `;
  docPanel.appendChild(form);
  wrap.appendChild(docPanel);

  const result = el("div", "ingest-result hidden");
  result.id = "ingest-result";
  wrap.appendChild(result);

  setTimeout(() => {
    loadIngestConnectors();
    bindIngestForm();
  }, 0);
  return wrap;
}

async function loadIngestConnectors() {
  const root = document.getElementById("ingest-connectors");
  if (!root) return;
  try {
    const data = await api("/connectors");
    root.innerHTML = "";
    const grid = el("div", "connector-grid");
    grid.appendChild(renderConnectorCard("gmail", data));
    root.appendChild(grid);

    const actions = el("div", "connector-actions");
    const syncBtn = el("button", "chip active", "Sync Gmail");
    syncBtn.type = "button";
    syncBtn.onclick = () => runConnectorSync("gmail", syncBtn);
    actions.appendChild(syncBtn);
    root.appendChild(actions);
  } catch (err) {
    root.innerHTML = `<p class="muted">Could not load connectors — ${err.message}</p>`;
  }
}

function renderConnectorCard(name, data) {
  const card = el("article", "connector-card panel");
  const cfg = data[name] || {};
  const probe = data.probes?.[name];
  const detail = cfg.query || "newer_than:30d";
  const status = cfg.configured
    ? (probe?.ok ? `<span class="pill ok">connected</span>` : `<span class="pill warn">configured</span>`)
    : `<span class="pill muted">not configured</span>`;
  const last = cfg.lastSync ? `Last sync ${new Date(cfg.lastSync).toLocaleString()}` : "Never synced";
  card.innerHTML = `
    <div class="connector-head"><h3>Gmail</h3>${status}</div>
    <p class="muted connector-meta">${probe?.ok ? probe.email : detail}</p>
    <p class="muted connector-meta">${last} · ${cfg.ingested || 0} ingested</p>
    ${cfg.lastError ? `<p class="connector-error">${cfg.lastError}</p>` : ""}
  `;
  return card;
}

async function runConnectorSync(which, btn) {
  if (btn) btn.disabled = true;
  const status = document.getElementById("ingest-status");
  if (status) status.textContent = "Syncing Gmail…";
  try {
    const data = await api("/connectors/gmail/sync", { method: "POST", body: JSON.stringify({}) });
    if (status) {
      status.textContent = data.ingested != null
        ? `Gmail: ${data.ingested} new, ${data.skipped || 0} skipped`
        : "Sync complete";
    }
    await loadIngestConnectors();
    state.graphLayoutStableKey = null;
    state.graphLayoutCache = null;
  } catch (err) {
    if (status) status.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindIngestForm() {
  const form = document.getElementById("ingest-form");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("ingest-status");
    const resultEl = document.getElementById("ingest-result");
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const payload = {
      label: fd.get("label") || "",
      text: fd.get("text"),
    };
    btn.disabled = true;
    status.textContent = "Extracting knowledge…";
    resultEl.classList.add("hidden");
    try {
      const data = await api("/ingest/document", { method: "POST", body: JSON.stringify(payload) });
      status.textContent = "";
      resultEl.classList.remove("hidden");
      const src = data.source === "engrammic-mcp" ? "Engrammic MCP" : "local demo store";
      const memId = data.memory?.node_id || data.trace?.memoryId;
      const claimId = data.claimNode?.id || data.trace?.claimId;
      const extracted = data.extracted?.claim || data.extracted?.title || "";
      resultEl.innerHTML = `
        <article class="ingest-success panel">
          <p><strong>Ingested via ${src}</strong>${data.partial ? " <span class='muted'>(memory only — learn incomplete)</span>" : ""}</p>
          ${extracted ? `<p class="muted extract-preview">${extracted.slice(0, 200)}${extracted.length > 200 ? "…" : ""}</p>` : ""}
          ${memId ? `<p class="muted">Memory · ${memId.slice(0, 8)}…</p>` : ""}
          ${claimId ? `<p class="muted">Knowledge · ${claimId.slice(0, 8)}…</p>` : ""}
          ${data.mcpError ? `<p class="muted">${data.mcpError}</p>` : ""}
          <div class="ingest-result-actions">
            ${claimId ? `<button type="button" class="chip" id="ingest-why-btn">Why</button>` : ""}
            ${claimId ? `<button type="button" class="chip" id="ingest-graph-btn">View in graph</button>` : ""}
          </div>
        </article>
      `;
      document.getElementById("ingest-why-btn")?.addEventListener("click", () => openWhyDrawer(claimId));
      document.getElementById("ingest-graph-btn")?.addEventListener("click", () => {
        state.page = "graph";
        state.graphSelection = claimId;
        state.graphLayoutStableKey = null;
        state.graphLayoutCache = null;
        renderShell();
        loadGraph(true);
        startGraphPolling();
      });
      form.reset();
      state.graphLayoutStableKey = null;
      state.graphLayoutCache = null;
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function loadIngestPage() {
  loadIngestConnectors();
  bindIngestForm();
}

function renderLivePage() {
  restoreLiveSession();
  const wrap = el("div", "live-layout");

  const status = el("p", "live-status-line muted");
  status.textContent = "Mirrors what Cursor + Engrammic recall for each prompt.";
  wrap.appendChild(status);

  const split = el("div", "live-body-split");
  const rail = el("aside", "live-timeline");
  rail.id = "live-timeline";
  const detail = el("div", "live-detail");
  detail.id = "live-detail";
  split.append(rail, detail);
  wrap.appendChild(split);

  renderLiveTimeline();
  renderLiveDetail();
  return wrap;
}

function renderLiveTimeline() {
  const rail = document.getElementById("live-timeline");
  if (!rail) return;
  rail.innerHTML = "";

  if (!state.liveEvents.length) {
    rail.appendChild(el("p", "live-idle", "Prompt in Cursor — each recall appears here with why."));
    const cta = el("p", "live-mcp-cta muted");
    cta.innerHTML =
      'Live recall uses Engrammic MCP. <a href="http://127.0.0.1:8790/mcp/login" target="_blank" rel="noopener">Connect MCP</a> if recalls stay empty.';
    rail.appendChild(cta);
    return;
  }

  for (const ev of state.liveEvents) {
    const btn = el("button", `timeline-item${state.selectedLiveId === ev.id ? " active" : ""}${ev.pending ? " pending" : ""}`);
    btn.type = "button";
    const src = ev.pending ? "recalling…" : sourceLabel(ev.source || ev.pack?.source);
    const count = ev.pending ? "…" : packItems(ev.pack).length || ev.itemCount || 0;
    btn.innerHTML = `
      <span class="live-time">${timeShort(ev.at)}</span>
      <span class="live-label">${promptPreview(ev.prompt)}</span>
      <span class="timeline-meta muted">${count} · ${src}</span>
    `;
    btn.onclick = () => {
      state.selectedLiveId = ev.id;
      persistLiveSession();
      renderLiveTimeline();
      renderLiveDetail();
    };
    rail.appendChild(btn);
  }
}

function renderLiveDetail() {
  const root = document.getElementById("live-detail");
  if (!root) return;
  root.innerHTML = "";

  const ev = state.liveEvents.find((e) => e.id === state.selectedLiveId) || state.liveEvents[0];
  if (!ev) return;
  state.selectedLiveId = ev.id;
  root.appendChild(liveEventDetail(ev));
}

function liveEventDetail(ev) {
  const pack = ev.pack;
  const items = pack ? packItems(pack) : [];
  const excluded = pack?.excluded || [];
  const cautions = pack?.cautions || [];
  const panel = el("article", "live-event-panel");

  if (!pack && ev.pending) {
    panel.appendChild(el("p", "live-recalling", "Recalling from Engrammic…"));
    if (ev.prompt) {
      const promptBox = el("blockquote", "live-prompt");
      promptBox.textContent = ev.prompt;
      panel.appendChild(promptBox);
    }
    return panel;
  }

  if (!pack) {
    if (ev.prompt) {
      const promptBox = el("blockquote", "live-prompt");
      promptBox.textContent = ev.prompt;
      panel.appendChild(promptBox);
    }
    panel.appendChild(el("p", "muted", "Recall detail unavailable for this prompt."));
    return panel;
  }

  const head = el("div", "live-event-head");
  const src = sourceLabel(ev.source || pack?.source);
  head.innerHTML = `
    <span class="live-time">${timeShort(ev.at)}</span>
    <span class="pill mcp">${ev.harness || "cursor"}</span>
    <span class="pill source-pill">${src}</span>
  `;
  panel.appendChild(head);

  const body = el("div", "live-body");
  renderOodBanner(body, offCorpusHint(pack, ev.mcpError));

  const meta = el("div", "live-meta muted");
  const metaParts = [
    `${items.length} recalled`,
    excluded.length ? `${excluded.length} superseded` : null,
    cautions.length ? `${cautions.length} cautions` : null,
    ev.workspaceLabel || null,
  ].filter(Boolean);
  meta.textContent = metaParts.join(" · ");
  body.appendChild(meta);

  if (ev.prompt) {
    const promptBox = el("blockquote", "live-prompt");
    promptBox.textContent = ev.prompt;
    body.appendChild(promptBox);
  }

  if (ev.suggestion && !state.dismissedSuggestions.has(ev.id)) {
    const sug = ev.suggestion;
    const card = el("div", "suggestion-card");
    const conf = formatConfidencePct(sug.confidence);
    card.innerHTML = `
      <p class="suggestion-eyebrow">Agent suggestion</p>
      <p class="suggestion-text">${sug.text}</p>
      ${sug.reason ? `<p class="muted suggestion-reason">${sug.reason}</p>` : ""}
    `;
    if (conf != null) {
      const badge = el("span", "confidence-badge", `${conf}%`);
      card.prepend(badge);
    }
    const actions = el("div", "suggestion-actions");
    if (sug.nodeId) {
      const whyBtn = el("button", "chip", "Why");
      whyBtn.type = "button";
      whyBtn.onclick = () => openWhyDrawer(sug.nodeId);
      actions.appendChild(whyBtn);
      const graphBtn = el("button", "chip", "Open in graph");
      graphBtn.type = "button";
      graphBtn.onclick = () => {
        state.page = "graph";
        state.graphSelection = sug.nodeId;
        renderShell();
        loadGraph(true);
        startGraphPolling();
      };
      actions.appendChild(graphBtn);
    }
    const dismissBtn = el("button", "chip", "Dismiss");
    dismissBtn.type = "button";
    dismissBtn.onclick = () => {
      state.dismissedSuggestions.add(ev.id);
      persistLiveSession();
      renderLiveDetail();
    };
    actions.appendChild(dismissBtn);
    card.appendChild(actions);
    body.appendChild(card);
  }

  if (pack?.mcpMeta?.retrieval_quality) {
    body.appendChild(
      el(
        "p",
        "live-rationale-head muted",
        `Engrammic retrieval: ${pack.mcpMeta.retrieval_quality}${pack.mcpMeta.search_time_ms ? ` · ${pack.mcpMeta.search_time_ms}ms` : ""}`
      )
    );
  }

  for (const c of cautions) {
    const line = el("div", "live-caution");
    line.innerHTML = `<strong>${c.topic || "Caution"}</strong> ${c.summary || ""}${c.rationale ? `<em class="muted"> — ${c.rationale}</em>` : ""}`;
    body.appendChild(line);
  }

  if (!items.length && !excluded.length) {
    body.appendChild(el("p", "muted", "Nothing matched this prompt in org memory."));
  } else {
    const list = el("ul", "live-items");
    for (const item of items) {
      const li = el("li", "live-item-recalled");
      const layer = item.layer || "memory";
      const conf = formatConfidencePct(item);
      const rationale = item.rationale ? `<span class="live-rationale">${item.rationale}</span>` : "";
      const why = item.whyItWorked ? `<span class="live-why muted">Why: ${item.whyItWorked.slice(0, 120)}</span>` : "";
      const confBadge = conf != null ? `<span class="confidence-badge sm">${conf}%</span>` : "";
      const tier = item.sourceTier ? `<span class="live-provenance muted">${item.sourceTier}</span>` : "";
      const tags = (item.tags || []).includes("ingested") ? `<span class="pill sm ingested-pill">ingested</span>` : "";
      const mcpNote = item.mcpRationale ? `<span class="live-provenance muted">${item.mcpRationale}</span>` : "";
      li.innerHTML = `<span class="layer-tag" style="--layer:${LAYER_COLOR_HEX[layer] || "#888"}">${layer}</span><div class="live-item-text">${confBadge}${tags}${tier}<strong>${item.title || item.content?.slice(0, 64) || "—"}</strong>${rationale}${why}${mcpNote}</div>`;
      if (item.id) {
        li.style.cursor = "pointer";
        li.onclick = () => openWhyDrawer(item.id);
      }
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  if (excluded.length) {
    body.appendChild(el("p", "live-rationale-head muted", "Not recalled (superseded)"));
    const exList = el("ul", "live-items live-items-excluded");
    for (const item of excluded) {
      const li = el("li");
      const layer = item.layer || "knowledge";
      li.innerHTML = `<span class="layer-tag" style="--layer:${LAYER_COLOR_HEX[layer] || "#888"}">${layer}</span><div class="live-item-text"><strong>${item.title || "—"}</strong><span class="live-rationale">${item.rationale || "superseded"}</span></div>`;
      if (item.id) {
        li.style.cursor = "pointer";
        li.onclick = () => openWhyDrawer(item.id);
      }
      exList.appendChild(li);
    }
    body.appendChild(exList);
  }

  if ((pack?.deniedCount || 0) > 0) {
    body.appendChild(el("p", "live-denied muted", `${pack.deniedCount} relevant node(s) withheld by role scope.`));
  }

  const actions = el("div", "live-actions");
  const copyBtn = el("button", "chip", "Copy context pack");
  copyBtn.type = "button";
  copyBtn.onclick = () => navigator.clipboard.writeText(packToMarkdown(ev.pack));
  actions.appendChild(copyBtn);
  if (items[0]?.id) {
    const graphBtn = el("button", "chip", "Open in graph");
    graphBtn.type = "button";
    graphBtn.onclick = () => {
      state.page = "graph";
      state.graphSelection = items[0].id;
      renderShell();
      loadGraph(true);
      startGraphPolling();
    };
    actions.appendChild(graphBtn);
  }
  body.appendChild(actions);
  panel.appendChild(body);
  return panel;
}

function liveEventRow(ev) {
  return liveEventDetail(ev);
}

function renderLiveStream() {
  renderLiveTimeline();
  renderLiveDetail();
}

function nodeLabel(n) {
  const generic = /^(memory|knowledge|wisdom|claim|document|commitment|belief|meta|intelligence|untitled)$/i;
  const candidates = [n.title, n.summary];
  if (n.content) {
    const excerpt = String(n.content).trim().replace(/\s+/g, ' ');
    if (excerpt.length >= 10) {
      const sentence = excerpt.match(/^[^.!?\n]{10,80}[.!?]?/)?.[0]?.trim() || excerpt.slice(0, 48);
      candidates.push(sentence);
    }
  }
  for (const c of candidates) {
    if (c && String(c).trim() && !generic.test(String(c).trim())) {
      const t = String(c).trim();
      return t.length > 52 ? `${t.slice(0, 51)}…` : t;
    }
  }
  if (n.tags?.length) return n.tags.slice(0, 2).join(' · ');
  return n.id ? `·${n.id.slice(0, 8)}` : 'Untitled';
}

function graphNeighbors(nodeId, edges) {
  const set = new Set([nodeId]);
  for (const e of edges) {
    if (e.from === nodeId) set.add(e.to);
    if (e.to === nodeId) set.add(e.from);
  }
  return set;
}

function placeLabels(nodes, pos, degree, activeSet) {
  const placed = [];
  const labels = new Map();
  let labelNodes;
  if (activeSet) {
    labelNodes = nodes.filter((n) => activeSet.has(n.id));
  } else {
    labelNodes = nodes.filter((n) => GraphLayout.HIGH_LAYER.has(n.layer) || (degree.get(n.id) || 0) >= 1);
  }
  labelNodes = labelNodes
    .sort((a, b) => {
      const score = (n) => (degree.get(n.id) || 0) * 2 + (GraphLayout.HIGH_LAYER.has(n.layer) ? 4 : 0);
      return score(b) - score(a);
    })
    .slice(0, activeSet ? 64 : nodes.length > 90 ? 28 : 48);

  const overlaps = (box) =>
    placed.some(
      (p) =>
        box.x < p.x + p.w &&
        box.x + box.w > p.x &&
        box.y < p.y + p.h &&
        box.y + box.h > p.y
    );

  const candidates = [
    { dx: 0, dy: -12, anchor: "middle" },
    { dx: 9, dy: -8, anchor: "start" },
    { dx: -9, dy: -8, anchor: "end" },
    { dx: 0, dy: 12, anchor: "middle" },
  ];

  for (const n of labelNodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const text = nodeLabel(n);
    const short = text.length > 22 ? `${text.slice(0, 21)}…` : text;
    const w = short.length * 4.8 + 4;
    const h = 10;
    let chosen = null;

    for (const c of candidates) {
      const box = {
        x: p.x + c.dx - (c.anchor === "end" ? w : c.anchor === "middle" ? w / 2 : 0),
        y: p.y + c.dy - 8,
        w,
        h,
      };
      if (!overlaps(box)) {
        chosen = { x: p.x + c.dx, y: p.y + c.dy, anchor: c.anchor, text: short, box };
        break;
      }
    }

    if (!chosen) continue;
    placed.push(chosen.box);
    labels.set(n.id, chosen);
  }

  return labels;
}

function ensureGraphTooltip() {
  let tip = document.getElementById("graph-tooltip-float");
  if (!tip) {
    tip = el("div", "graph-tooltip graph-tooltip-float hidden");
    tip.id = "graph-tooltip-float";
    document.body.appendChild(tip);
  }
  return tip;
}

function hideGraphTooltip() {
  document.getElementById("graph-tooltip-float")?.classList.add("hidden");
}

function showGraphTooltip(node, clientX, clientY) {
  const tip = ensureGraphTooltip();
  const title = nodeLabel(node);
  tip.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = title.length > 52 ? `${title.slice(0, 51)}…` : title;
  tip.appendChild(strong);
  const meta = document.createElement("span");
  meta.className = "graph-tooltip-meta";
  meta.textContent = `${node.layer}${node.team && node.team !== "Company" ? ` · ${node.team}` : ""}`;
  tip.appendChild(meta);
  tip.classList.remove("hidden");
  tip.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
}

function patchGraphHighlight(nodeId, on) {
  const group = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!group) return;
  const highlight = group.querySelector(".graph-node-highlight");
  const dot = group.querySelector(".graph-node-dot");
  if (highlight) highlight.setAttribute("opacity", on ? "0.85" : "0");
  if (dot && on) dot.setAttribute("opacity", "1");
}

function setGraphHover(nodeId) {
  if (state.graphHoverId === nodeId) return;
  if (state.graphHoverId && state.graphHoverId !== state.graphSelection) {
    patchGraphHighlight(state.graphHoverId, false);
  }
  state.graphHoverId = nodeId;
  if (nodeId && nodeId !== state.graphSelection) patchGraphHighlight(nodeId, true);
}

function graphHitTest(svg, rootG, evt, nodes, pos, degree) {
  const ctm = rootG.getScreenCTM()?.inverse();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const local = pt.matrixTransform(ctm);
  let best = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    const p = pos.get(node.id);
    if (!p) continue;
    const hitR = GraphLayout.nodeRadius(node, degree) + 5;
    const d = Math.hypot(local.x - p.x, local.y - p.y);
    if (d <= hitR && d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function updateGraphSelectionUi() {
  document.getElementById("graph-clear-focus")?.style.setProperty("display", state.graphSelection ? "" : "none");
  document.getElementById("graph-trace-btn")?.style.setProperty("display", state.graphSelection ? "" : "none");
  for (const group of document.querySelectorAll("[data-node-id]")) {
    const id = group.getAttribute("data-node-id");
    const on = id === state.graphSelection || id === state.graphHoverId;
    patchGraphHighlight(id, on);
  }
}

function renderGraphPage() {
  const wrap = el("div", "graph-page");
  const oodHost = el("div", "graph-ood-host");
  oodHost.id = "graph-ood-host";
  wrap.appendChild(oodHost);
  renderGraphOodBanner(oodHost);

  const toolbar = el("div", "graph-toolbar");
  for (const layer of ["all", "memory", "knowledge", "wisdom"]) {
    const btn = el("button", state.graphFocus === layer ? "chip active" : "chip", layer);
    btn.type = "button";
    btn.onclick = () => {
      state.graphFocus = layer;
      renderGraphSvg();
      document.querySelectorAll(".graph-toolbar .chip").forEach((b) => {
        b.classList.toggle("active", b.textContent === layer);
      });
    };
    toolbar.appendChild(btn);
  }
  const count = el("span", "graph-count muted", "");
  count.id = "graph-count";
  toolbar.appendChild(count);
  const clearBtn = el("button", "chip", "clear focus");
  clearBtn.type = "button";
  clearBtn.id = "graph-clear-focus";
  clearBtn.style.display = state.graphSelection ? "" : "none";
  clearBtn.onclick = () => {
    state.graphSelection = null;
    state.provenanceNodeId = null;
    closeProvenanceDrawer();
    updateGraphSelectionUi();
  };
  toolbar.appendChild(clearBtn);

  const traceBtn = el("button", "chip", "trace");
  traceBtn.type = "button";
  traceBtn.id = "graph-trace-btn";
  traceBtn.style.display = state.graphSelection ? "" : "none";
  traceBtn.onclick = () => {
    if (state.graphSelection) loadProvenance(state.graphSelection);
  };
  toolbar.appendChild(traceBtn);

  const zoomOut = el("button", "chip icon-chip", "−");
  zoomOut.type = "button";
  zoomOut.title = "Zoom out";
  zoomOut.onclick = () => {
    state.graphTransform.k = Math.max(0.45, state.graphTransform.k * 0.88);
    const g = document.querySelector("#graph-stage svg g");
    if (g) g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
  };
  toolbar.appendChild(zoomOut);

  const zoomIn = el("button", "chip icon-chip", "+");
  zoomIn.type = "button";
  zoomIn.title = "Zoom in";
  zoomIn.onclick = () => {
    state.graphTransform.k = Math.min(3, state.graphTransform.k * 1.12);
    const g = document.querySelector("#graph-stage svg g");
    if (g) g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
  };
  toolbar.appendChild(zoomIn);

  wrap.appendChild(toolbar);

  const stage = el("div", "graph-stage");
  stage.id = "graph-stage";
  const hint = el("p", "graph-hint muted", "Click node for why · Double-click to focus · Drag pan · Scroll zoom");
  wrap.appendChild(stage);
  wrap.appendChild(hint);

  setTimeout(() => {
    if (state.graphData) renderGraphSvg();
    else loadGraph(true);
    bindGraphResize(stage);
    if (state.provenanceNodeId && state.page === "graph") loadProvenance(state.provenanceNodeId);
  }, 0);
  return wrap;
}

function renderGraphOodBanner(host) {
  if (!host) host = document.getElementById("graph-ood-host");
  if (!host) return;
  host.innerHTML = "";
  const data = state.graphData;
  if (!data) return;
  if (data.mcpError && data.source === "engrammic-mcp" && !data.nodes?.length) return;
  if (data.mcpError && data.source === "local-demo") {
    renderOodBanner(host, { title: "Demo fallback graph", detail: data.mcpError });
    return;
  }
  if (data.source === "engrammic-mcp" && !data.nodes?.length) {
    renderOodBanner(host, { title: "Empty live graph", detail: "Connected to Engrammic but no nodes returned — memory may be off-corpus or not captured yet." });
  }
}

function closeProvenanceDrawer() {
  state.provenanceNodeId = null;
  state.provenanceData = null;
  document.getElementById("why-drawer")?.classList.add("hidden");
}

async function loadProvenance(nodeId) {
  state.provenanceNodeId = nodeId;
  const drawer = document.getElementById("why-drawer");
  const body = document.getElementById("why-drawer-body");
  if (!drawer || !body) return;
  drawer.classList.remove("hidden");
  body.innerHTML = '<p class="muted">Loading trace…</p>';
  try {
    const data = await api(`/nodes/${encodeURIComponent(nodeId)}`);
    state.provenanceData = data;
    renderProvenanceBody(body, data);
  } catch {
    const node = state.graphData?.nodes?.find((n) => n.id === nodeId);
    const chain = dedupeProvenanceChain(traceFromGraph(nodeId, state.graphData?.nodes || [], state.graphData?.edges || []), nodeId);
    state.provenanceData = { node, trace: { chain }, orphan: !chain.some((n) => n.layer === "memory") };
    renderProvenanceBody(body, state.provenanceData);
  }
}

function renderProvenanceBody(host, data) {
  host.innerHTML = "";
  const node = data.node || state.graphData?.nodes?.find((n) => n.id === state.provenanceNodeId);
  if (!node) {
    host.appendChild(el("p", "muted", "Node not found."));
    return;
  }

  const conf = formatConfidencePct(data.confidence ?? node);
  if (conf != null) {
    const confRow = el("div", "prov-section");
    confRow.innerHTML = `<p class="prov-label">Confidence</p><span class="confidence-badge">${conf}%</span>`;
    host.appendChild(confRow);
  }

  if (data.source) {
    const srcRow = el("p", "muted prov-source");
    srcRow.textContent = `Source: ${sourceLabel(data.source)}`;
    host.appendChild(srcRow);
  }

  const head = el("article", "prov-card");
  head.innerHTML = `<span class="layer-tag" style="--layer:${LAYER_COLOR_HEX[node.layer] || "#888"}">${node.layer}</span><strong>${nodeLabel(node)}</strong><p>${(node.content || node.summary || "").slice(0, 200)}</p>`;
  host.appendChild(head);

  if (node.rationale) {
    const why = el("div", "prov-section");
    why.innerHTML = `<p class="prov-label">Why recalled</p><p>${node.rationale}</p>`;
    host.appendChild(why);
  }

  const chain = dedupeProvenanceChain(data.trace?.chain || data.trace || [], node.id);
  const chainList = Array.isArray(chain) ? chain : chain.chain || [];
  if (chainList.length) {
    const sec = el("div", "prov-section");
    sec.innerHTML = '<p class="prov-label">Provenance chain</p>';
    const list = el("ol", "prov-chain");
    for (const n of chainList) {
      const li = el("li");
      li.innerHTML = `<span class="layer-tag" style="--layer:${LAYER_COLOR_HEX[n.layer] || "#888"}">${n.layer || "?"}</span> <strong>${nodeLabel(n)}</strong><p class="muted">${(n.content || n.summary || "").slice(0, 120)}</p>`;
      list.appendChild(li);
    }
    sec.appendChild(list);
    host.appendChild(sec);
  } else if (data.orphan || node.layer === "wisdom") {
    host.appendChild(
      el(
        "p",
        "muted prov-orphan",
        "No supporting memory linked in Engrammic yet — this belief may be synthesized without captured evidence, or memory is still being ingested."
      )
    );
  } else {
    host.appendChild(el("p", "muted", "No provenance chain found."));
  }

  if (node.supersededBy) {
    const sup = el("div", "prov-section prov-superseded");
    sup.innerHTML = `<p class="prov-label">Supersession</p><p class="muted">Superseded by ${node.supersededBy}</p>`;
    host.appendChild(sup);
  }

  const actions = el("div", "prov-actions");
  const graphBtn = el("button", "chip", "View on graph");
  graphBtn.type = "button";
  graphBtn.onclick = () => {
    state.page = "graph";
    state.graphSelection = node.id;
    renderShell();
    loadGraph(true);
    startGraphPolling();
  };
  actions.appendChild(graphBtn);
  host.appendChild(actions);
}

function bindGraphResize(stage) {
  if (state.graphResizeObs) {
    state.graphResizeObs.disconnect();
    state.graphResizeObs = null;
  }
}

function graphLayoutCacheKey(data) {
  const nodeIds = (data.nodes || []).map((n) => n.id).sort().join("|");
  const edgeKeys = (data.edges || [])
    .map((e) => `${e.from}:${e.to}:${e.type || ""}`)
    .sort()
    .join("|");
  return `${nodeIds}::${edgeKeys}`;
}

function getGraphLayout(data) {
  const key = graphLayoutCacheKey(data);
  if (state.graphLayoutStableKey === key && state.graphLayoutCache) {
    return state.graphLayoutCache;
  }
  const result = GraphLayout.layoutGraph(data.nodes, data.edges, GRAPH_LAYOUT.width, GRAPH_LAYOUT.height);
  state.graphLayoutStableKey = key;
  state.graphLayoutCache = result;
  return result;
}

function renderGraphSvg() {
  const stage = document.getElementById("graph-stage");
  const countEl = document.getElementById("graph-count");
  if (!stage || !state.graphData) return;

  hideGraphTooltip();
  state.graphHoverId = null;
  if (state.graphHoverTimer) {
    clearTimeout(state.graphHoverTimer);
    state.graphHoverTimer = null;
  }

  const data = state.graphData;
  const focus = state.graphFocus;
  const selection = state.graphSelection;

  const clearBtn = document.getElementById("graph-clear-focus");
  if (clearBtn) clearBtn.style.display = selection ? "" : "none";
  const traceBtn = document.getElementById("graph-trace-btn");
  if (traceBtn) traceBtn.style.display = selection ? "" : "none";

  if (!data.nodes?.length) {
    stage.innerHTML = "";
    const empty = el("div", "graph-empty");
    const connect = data.mcpError
      ? `<p><button type="button" class="chip active" id="mcp-connect-btn">Connect Engrammic</button></p>`
      : "";
    empty.innerHTML = data.mcpError
      ? `<p><strong>Engrammic graph unavailable</strong></p><p class="muted">${data.mcpError}</p>${connect}<p class="muted">Local OAuth saves token to <code>~/.cursor/aabw/mcp-token</code></p>`
      : data.source === "local-demo"
        ? `<p><strong>Demo store empty</strong></p><p class="muted">No nodes in the local demo corpus for your scope.</p>`
        : `<p><strong>No graph data</strong></p><p class="muted">Memory may be off-corpus or not yet captured.</p>`;
    stage.appendChild(empty);
    const btn = document.getElementById("mcp-connect-btn");
    if (btn) {
      btn.onclick = () => {
        window.open("http://127.0.0.1:8790/mcp/login", "_blank");
      };
    }
    if (countEl) countEl.textContent = `0 nodes · ${data.source === "engrammic-mcp" ? "live" : data.source === "local-demo" ? "demo" : "offline"}`;
    renderGraphOodBanner();
    return;
  }

  const width = GRAPH_LAYOUT.width;
  const height = GRAPH_LAYOUT.height;

  const layoutEdges = GraphLayout.layoutEdgesFrom(data.edges);
  const activeSet = selection ? graphNeighbors(selection, layoutEdges) : null;

  const { pos, degree, metrics, meta } = getGraphLayout(data);
  const nodeRadiusFn = GraphLayout.nodeRadius;
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const labels = placeLabels(data.nodes, pos, degree, activeSet);

  if (countEl) {
    const src = data.source === "engrammic-mcp" ? "live" : data.source === "local-demo" ? "demo" : "offline";
    const err = data.mcpError ? ` · ${data.mcpError}` : "";
    const focusNote = activeSet ? ` · focus ${activeSet.size}` : "";
    const layoutNote = metrics?.overlaps ? ` · ${metrics.overlaps} overlap` : "";
    countEl.textContent = `${data.nodes.length} nodes · ${layoutEdges.length} links · ${src}${focusNote}${layoutNote}${err}`;
    countEl.title = data.authHint || "";
  }
  renderGraphOodBanner();

  stage.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "graph-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);

  const ringLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  ringLayer.setAttribute("class", "graph-rings");
  for (const orbit of meta?.orbits || []) {
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", orbit.cx);
    ring.setAttribute("cy", orbit.cy);
    ring.setAttribute("r", orbit.r);
    ring.setAttribute("class", orbit.isSun ? "ring-sun" : "ring-planet");
    ringLayer.appendChild(ring);
    if (orbit.label && !orbit.isSun) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", orbit.cx);
      label.setAttribute("y", orbit.cy - orbit.r - 6);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "graph-planet-label");
      label.textContent = orbit.label.length > 18 ? `${orbit.label.slice(0, 17)}…` : orbit.label;
      ringLayer.appendChild(label);
    }
  }
  if (meta?.orbits?.[0]?.isSun) {
    const sun = meta.orbits[0];
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    glow.setAttribute("cx", sun.cx);
    glow.setAttribute("cy", sun.cy);
    glow.setAttribute("r", sun.r + 8);
    glow.setAttribute("class", "ring-sun-glow");
    ringLayer.insertBefore(glow, ringLayer.firstChild);
  }

  const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  edgeLayer.setAttribute("class", "graph-edges");
  const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  nodeLayer.setAttribute("class", "graph-nodes");
  const labelLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  labelLayer.setAttribute("class", "graph-labels");

  const drawEdge = (e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return;
    const na = byId.get(e.from);
    const nb = byId.get(e.to);
    const layerDim =
      focus !== "all" &&
      (!na || na.layer !== focus) &&
      (!nb || nb.layer !== focus);
    const focusDim = activeSet && (!activeSet.has(e.from) || !activeSet.has(e.to));
    const selected = selection && (e.from === selection || e.to === selection);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute(
      "stroke",
      focusDim ? "rgba(22,20,18,0.04)" : selected ? "rgba(22,20,18,0.42)" : layerDim ? "rgba(22,20,18,0.05)" : "rgba(22,20,18,0.16)"
    );
    line.setAttribute("stroke-width", selected ? "1.1" : "0.7");
    edgeLayer.appendChild(line);
  };

  for (const e of layoutEdges) drawEdge(e);

  for (const node of data.nodes) {
    const p = pos.get(node.id);
    if (!p) continue;
    const layerDim = focus !== "all" && node.layer !== focus;
    const focusDim = activeSet && !activeSet.has(node.id);
    const isSelected = selection === node.id;
    const dim = layerDim || focusDim;
    const fill = LAYER_COLOR_HEX[node.layer] || "#888";
    const r = nodeRadiusFn(node, degree);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `graph-node ${node.layer}${isSelected ? " selected" : ""}`);
    group.setAttribute("data-node-id", node.id);
    group.style.cursor = "pointer";

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", fill);
    circle.setAttribute("opacity", dim ? "0.08" : node.layer === "memory" ? "0.55" : "0.92");
    circle.setAttribute("class", "graph-node-dot");
    circle.setAttribute("pointer-events", "none");
    group.appendChild(circle);

    const highlight = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    highlight.setAttribute("cx", p.x);
    highlight.setAttribute("cy", p.y);
    highlight.setAttribute("r", r + 2);
    highlight.setAttribute("fill", "none");
    highlight.setAttribute("stroke", fill);
    highlight.setAttribute("stroke-width", "1.5");
    highlight.setAttribute("opacity", isSelected ? "0.85" : "0");
    highlight.setAttribute("pointer-events", "none");
    highlight.setAttribute("class", "graph-node-highlight");
    group.appendChild(highlight);

    const labelInfo = labels.get(node.id);
    if (labelInfo && !layerDim) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", labelInfo.x);
      label.setAttribute("y", labelInfo.y);
      label.setAttribute("text-anchor", labelInfo.anchor);
      label.setAttribute("class", `graph-label${focusDim ? " dim" : ""}`);
      label.setAttribute("pointer-events", "none");
      label.textContent = labelInfo.text;
      labelLayer.appendChild(label);
    }

    nodeLayer.appendChild(group);
  }

  g.appendChild(ringLayer);
  g.appendChild(edgeLayer);
  g.appendChild(nodeLayer);
  g.appendChild(labelLayer);
  svg.appendChild(g);
  stage.appendChild(svg);

  if (state.graphMouseupHandler) {
    window.removeEventListener("mouseup", state.graphMouseupHandler);
    state.graphMouseupHandler = null;
  }

  let dragging = false;
  let last = null;
  state.graphDragMoved = false;
  svg.addEventListener("mousedown", (e) => {
    dragging = true;
    state.graphDragMoved = false;
    last = { x: e.clientX, y: e.clientY };
  });
  state.graphMouseupHandler = () => {
    dragging = false;
    last = null;
  };
  window.addEventListener("mouseup", state.graphMouseupHandler);
  svg.addEventListener("mousemove", (evt) => {
    if (dragging && last) {
      if (Math.abs(evt.clientX - last.x) + Math.abs(evt.clientY - last.y) > 4) {
        state.graphDragMoved = true;
      }
      state.graphTransform.x += evt.clientX - last.x;
      state.graphTransform.y += evt.clientY - last.y;
      last = { x: evt.clientX, y: evt.clientY };
      g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
      return;
    }
    const hit = graphHitTest(svg, g, evt, data.nodes, pos, degree);
    if (hit) {
      if (state.graphHoverTimer) {
        clearTimeout(state.graphHoverTimer);
        state.graphHoverTimer = null;
      }
      setGraphHover(hit.id);
      showGraphTooltip(hit, evt.clientX, evt.clientY);
    } else if (!state.graphHoverTimer) {
      state.graphHoverTimer = setTimeout(() => {
        state.graphHoverTimer = null;
        setGraphHover(null);
        hideGraphTooltip();
      }, 60);
    }
  });
  svg.addEventListener("mouseleave", () => {
    if (state.graphHoverTimer) clearTimeout(state.graphHoverTimer);
    state.graphHoverTimer = null;
    setGraphHover(null);
    hideGraphTooltip();
  });
  svg.addEventListener("click", (evt) => {
    if (state.graphDragMoved) return;
    const hit = graphHitTest(svg, g, evt, data.nodes, pos, degree);
    if (hit) {
      state.graphSelection = hit.id;
      updateGraphSelectionUi();
      openWhyDrawer(hit.id);
      return;
    }
    if (state.graphSelection) {
      state.graphSelection = null;
      updateGraphSelectionUi();
      closeProvenanceDrawer();
    }
  });
  svg.addEventListener("dblclick", (evt) => {
    const hit = graphHitTest(svg, g, evt, data.nodes, pos, degree);
    if (!hit) return;
    evt.stopPropagation();
    const p = pos.get(hit.id);
    if (!p) return;
    state.graphSelection = hit.id;
    state.graphTransform = { x: width / 2 - p.x, y: height / 2 - p.y, k: Math.min(2.2, state.graphTransform.k * 1.25) };
    g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
    updateGraphSelectionUi();
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    state.graphTransform.k = Math.min(3, Math.max(0.45, state.graphTransform.k * delta));
    g.setAttribute("transform", `translate(${state.graphTransform.x},${state.graphTransform.y}) scale(${state.graphTransform.k})`);
  }, { passive: false });
  svg.addEventListener("dblclick", () => {
    state.graphTransform = { x: 0, y: 0, k: 1 };
    g.setAttribute("transform", "translate(0,0) scale(1)");
  });
}

async function loadGraph(force = false, preserveView = false) {
  if (state.graphLoading) {
    state.pendingGraphRefresh = force || state.pendingGraphRefresh;
    return;
  }
  if (state.graphData && !force && !preserveView) return;
  const prevTransform = preserveView ? { ...state.graphTransform } : null;
  const prevKey = state.graphData ? graphLayoutCacheKey(state.graphData) : null;
  startLoadProgress();
  try {
    bumpLoadProgress(12);
    const qs = force ? "fresh=1&live=1" : "live=1";
    const nextData = await api(`/graph?${qs}`);
    const nextKey = graphLayoutCacheKey(nextData);
    const layoutUnchanged = prevKey && prevKey === nextKey;
    state.graphData = nextData;
    if (!layoutUnchanged) {
      state.graphLayoutStableKey = null;
      state.graphLayoutCache = null;
    }
    bumpLoadProgress(58);
    await new Promise((r) => requestAnimationFrame(r));
    if (state.page === "graph") {
      if (!preserveView && !layoutUnchanged) state.graphTransform = { x: 0, y: 0, k: 1 };
      else if (prevTransform) state.graphTransform = prevTransform;
      bumpLoadProgress(76);
      await new Promise((r) => requestAnimationFrame(r));
      renderGraphSvg();
      bumpLoadProgress(100);
    }
  } catch {
    if (!state.graphData) state.graphData = { nodes: [], edges: [], source: "unavailable" };
  } finally {
    endLoadProgress();
    if (state.pendingGraphRefresh) {
      const pending = state.pendingGraphRefresh;
      state.pendingGraphRefresh = false;
      loadGraph(pending, true);
    }
  }
}

function ensureLoadBar() {
  let bar = document.getElementById("load-bar");
  if (bar) return bar;
  bar = el("div", "load-bar hidden");
  bar.id = "load-bar";
  bar.innerHTML = '<div class="load-fill" id="load-fill"></div>';
  document.body.appendChild(bar);
  return bar;
}

function updateLoadBar() {
  const fill = document.getElementById("load-fill");
  if (fill) fill.style.width = `${Math.min(100, state.loadProgress)}%`;
}

function startLoadProgress() {
  state.graphLoading = true;
  state.loadProgress = 2;
  const bar = ensureLoadBar();
  bar.classList.remove("hidden");
  updateLoadBar();
  if (state.loadTimer) clearInterval(state.loadTimer);
  state.loadTimer = setInterval(() => {
    if (state.loadProgress < 88) {
      state.loadProgress = Math.min(88, state.loadProgress + 1.5);
      updateLoadBar();
    }
  }, 80);
}

function endLoadProgress() {
  state.loadProgress = 100;
  updateLoadBar();
  if (state.loadTimer) {
    clearInterval(state.loadTimer);
    state.loadTimer = null;
  }
  state.graphLoading = false;
  setTimeout(() => {
    document.getElementById("load-bar")?.classList.add("hidden");
    state.loadProgress = 0;
  }, 320);
}

function bumpLoadProgress(v) {
  state.loadProgress = Math.max(state.loadProgress, v);
  updateLoadBar();
}

function applyLivePending(event) {
  if (!event?.prompt) return;
  const entry = {
    id: event.id || Date.now(),
    at: event.at,
    prompt: event.prompt,
    harness: event.harness,
    workspaceLabel: event.workspaceLabel,
    pack: null,
    pending: true,
  };
  state.liveEvents = mergeLiveEvents([entry]);
  state.selectedLiveId = entry.id;
  renderLiveStream();
  focusCompanionWindow();
  const pill = document.getElementById("conn-pill");
  if (pill) {
    pill.textContent = "live";
    pill.className = "pill live";
  }
  state.liveOn = true;
  persistLiveSession();
}

function applyLiveEvent(event) {
  if (event?.pack && !isLivePack(event.pack, event.source)) return;
  const entry = {
    id: event.id || Date.now(),
    at: event.at,
    prompt: event.prompt,
    harness: event.harness,
    workspaceLabel: event.workspaceLabel,
    pack: event.pack,
    source: event.source || event.pack?.source,
    mcpError: event.mcpError,
    suggestion: event.suggestion,
    pending: false,
  };
  state.liveEvents = mergeLiveEvents([entry]);
  state.selectedLiveId = entry.id;

  renderLiveStream();
  scheduleGraphRefresh(false);
  focusCompanionWindow();

  const pill = document.getElementById("conn-pill");
  if (pill) {
    pill.textContent = "live";
    pill.className = "pill live";
  }
  state.liveOn = true;
  persistLiveSession();
}

function connectLive() {
  disconnectLive();
  const source = new EventSource("/stream");
  state.liveSource = source;
  source.addEventListener("open", () => {
    state.liveOn = true;
    const pill = document.getElementById("conn-pill");
    if (pill) {
      pill.textContent = "live";
      pill.className = "pill live";
    }
    document.getElementById("banner-global")?.classList.add("hidden");
  });
  source.addEventListener("error", () => {
    state.liveOn = false;
    const pill = document.getElementById("conn-pill");
    if (pill) {
      pill.textContent = "·";
      pill.className = "pill error";
    }
    const banner = document.getElementById("banner-global");
    if (banner) {
      banner.textContent = "Gateway offline — run npm start.";
      banner.classList.remove("hidden");
    }
    source.close();
    state.liveSource = null;
    setTimeout(connectLive, 2000);
  });
  source.addEventListener("graph", (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.version && payload.version <= state.lastGraphVersion) return;
      state.lastGraphVersion = payload.version || Date.now();
      scheduleGraphRefresh(false);
    } catch {}
  });
  source.addEventListener("snapshot", (e) => {
    try {
      const snap = JSON.parse(e.data);
      hydrateFromSnapshot(snap);
      renderLiveStream();
    } catch {}
  });
  source.addEventListener("prompt-pending", (e) => {
    try {
      applyLivePending(JSON.parse(e.data));
    } catch {}
  });
  source.addEventListener("prompt", (e) => {
    try {
      applyLiveEvent(JSON.parse(e.data));
    } catch {}
  });
}

async function loadInbox() {
  const root = document.getElementById("inbox-root");
  if (!root) return;
  try {
    const [inbox, conflicts] = await Promise.all([
      api("/inbox"),
      api("/conflicts?status=open").catch(() => ({ conflicts: [] })),
    ]);
    root.innerHTML = "";
    const stats = el("div", "inbox-stats");
    stats.innerHTML = `<span class="pill">Open ${inbox.totals?.open || 0}</span><span class="pill">Conflicts ${inbox.totals?.conflicts || 0}</span>`;
    root.appendChild(stats);

    const conflictMap = new Map((conflicts.conflicts || []).map((c) => [c.id, c]));

    for (const item of (inbox.queue || []).slice(0, 12)) {
      const row = el("article", `inbox-item inbox-${item.type}`);
      row.innerHTML = `<span class="pill issue-${item.type}">${item.type}</span><strong>${item.title}</strong><span class="muted">${item.summary}</span>`;
      if (item.type === "conflict" && conflictMap.has(item.id)) {
        const c = conflictMap.get(item.id);
        const actions = el("div", "inbox-actions");
        for (const side of [c.a, c.b].filter(Boolean)) {
          const btn = el("button", "chip", `Adopt: ${(side.title || side.id).slice(0, 28)}`);
          btn.type = "button";
          btn.onclick = async () => {
            btn.disabled = true;
            try {
              await api(`/conflicts/${c.id}/resolve`, {
                method: "POST",
                body: JSON.stringify({ winnerId: side.id, note: "Resolved in companion" }),
              });
              state.graphLayoutCache = null;
              loadInbox();
              if (state.page === "graph") loadGraph(true);
            } catch (err) {
              btn.textContent = err.message;
            }
          };
          actions.appendChild(btn);
        }
        row.appendChild(actions);
      }
      root.appendChild(row);
    }
    if (!inbox.queue?.length) root.appendChild(el("p", "muted", "Inbox clear."));
  } catch (err) {
    root.innerHTML = `<p class="muted">${err.message}</p>`;
  }
}

async function bootApp() {
  try {
    document.getElementById("login")?.classList.add("hidden");
    document.getElementById("app")?.classList.remove("hidden");
    restoreLiveSession();
    renderShell();
    await loadLiveState();
    if (state.page === "inbox") loadInbox();
    if (state.page === "graph") {
      loadGraph(false);
      startGraphPolling();
    }
    connectLive();
  } catch (err) {
    const loginRoot = document.getElementById("login");
    document.getElementById("app")?.classList.add("hidden");
    loginRoot?.classList.remove("hidden");
    if (loginRoot) {
      loginRoot.innerHTML = `<div class="login-card"><p class="eyebrow">Engrammic</p><h1>UI failed to load</h1><p class="lede muted">${err.message}</p></div>`;
    }
  }
}

async function init() {
  const loginRoot = document.getElementById("login");
  loginRoot.classList.remove("hidden");
  loginRoot.innerHTML = '<div class="login-card"><p class="eyebrow">Engrammic</p><h1>Org Memory</h1><p class="lede muted">Loading…</p></div>';

  try {
    const [me, personas] = await Promise.all([api("/auth/me"), api("/auth/personas")]);
    if (me.authenticated) {
      state.user = me.user;
      await bootApp();
    } else {
      renderLogin(personas.personas || []);
    }
  } catch (err) {
    const loginRoot = document.getElementById("login");
    loginRoot.classList.remove("hidden");
    document.getElementById("app")?.classList.add("hidden");
    loginRoot.innerHTML = "";
    const card = el("div", "login-card");
    card.innerHTML = `
      <p class="eyebrow">Engrammic</p>
      <h1>Gateway offline</h1>
      <p class="lede">Run <code>npm start</code>, then reload.</p>
    `;
    loginRoot.appendChild(card);
  }
}

init();
