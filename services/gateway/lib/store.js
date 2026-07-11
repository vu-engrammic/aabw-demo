/**
 * Engrammic-shaped org memory store for the demo control plane.
 *
 * Layers: memory (observations) → knowledge (claims + capabilities) → wisdom (beliefs).
 * Edges: DERIVED_FROM, ABOUT, SUPERSEDES, CONTRADICTS.
 * Live Engrammic access is MCP-only; this local store mirrors its shape so the
 * UI contracts hold when a real MCP bridge sits behind the same API.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const access = require('./access');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'org-memory.json');

let cache = null;

function id(prefix) {
  return prefix + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function emptyStore() {
  return { nodes: [], edges: [], conflicts: [], queries: [], sources: [] };
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    cache = emptyStore();
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
}

function reset() {
  cache = emptyStore();
  save();
  return cache;
}

// ---------- writes ----------

function addNode(node) {
  const store = load();
  const row = {
    id: node.id || id(node.layer === 'memory' ? 'mem' : node.layer === 'wisdom' ? 'wis' : 'kn'),
    layer: node.layer,
    type: node.type || (node.layer === 'memory' ? 'observation' : node.layer === 'wisdom' ? 'belief' : 'claim'),
    title: node.title,
    content: node.content || '',
    whyItWorked: node.whyItWorked || null,
    owner: node.owner || null,
    ownerId: node.ownerId || node.owner || null,
    scope: node.scope || 'team',
    team: node.team || 'Company',
    classification: node.classification || 'internal',
    sourceUri: node.sourceUri || null,
    sourceTier: node.sourceTier || null,
    tags: node.tags || [],
    confidence: node.confidence ?? null,
    heat: node.heat || 0,
    hits: 0,
    supersededBy: null,
    createdAt: node.createdAt || new Date().toISOString(),
  };
  store.nodes.push(row);
  save();
  return row;
}

function addEdge(type, from, to) {
  const store = load();
  const edge = { type, from, to, createdAt: new Date().toISOString() };
  store.edges.push(edge);
  save();
  return edge;
}

function addConflict({ nodeA, nodeB, topic, summary, preferred }) {
  const store = load();
  const conflict = {
    id: id('conf'),
    nodeA,
    nodeB,
    topic,
    summary,
    preferred: preferred || nodeA,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  store.conflicts.push(conflict);
  addEdge('CONTRADICTS', nodeA, nodeB);
  save();
  return conflict;
}

function resolveConflict(conflictId, { winnerId, note, resolvedBy }) {
  const store = load();
  const conflict = store.conflicts.find((c) => c.id === conflictId);
  if (!conflict) throw new Error('Conflict not found');
  if (conflict.status !== 'open') throw new Error('Conflict already resolved');

  const loserId = winnerId === conflict.nodeA ? conflict.nodeB : conflict.nodeA;
  const winner = store.nodes.find((n) => n.id === winnerId);
  const loser = store.nodes.find((n) => n.id === loserId);
  if (!winner || !loser) throw new Error('Conflict nodes missing');

  loser.supersededBy = winnerId;
  addEdge('SUPERSEDES', winnerId, loserId);

  const belief = addNode({
    layer: 'wisdom',
    type: 'belief',
    title: `Adopted: ${winner.title}`,
    content: `${winner.content} (Adjudicated over: "${loser.title}".)`,
    team: winner.team,
    classification: winner.classification,
    tags: ['adjudicated', ...(winner.tags || [])],
    confidence: 0.9,
  });
  addEdge('ABOUT', belief.id, winnerId);

  conflict.status = 'resolved';
  conflict.winnerId = winnerId;
  conflict.beliefId = belief.id;
  conflict.note = note || '';
  conflict.resolvedBy = resolvedBy || null;
  conflict.resolvedAt = new Date().toISOString();
  save();
  return { conflict, belief };
}

function recordQuery(query, hitCount, userId) {
  const store = load();
  store.queries.push({
    id: id('q'),
    query,
    hitCount,
    userId: userId || null,
    at: new Date().toISOString(),
  });
  if (store.queries.length > 500) store.queries = store.queries.slice(-500);
  save();
}

function bumpHeat(nodeIds) {
  const store = load();
  for (const nid of nodeIds) {
    const node = store.nodes.find((n) => n.id === nid);
    if (node) {
      node.hits += 1;
      node.heat += 1;
    }
  }
  save();
}

function upsertSource(source) {
  const store = load();
  const existing = store.sources.find((s) => s.id === source.id);
  if (existing) Object.assign(existing, source);
  else store.sources.push(source);
  save();
}

function syncSource(sourceId) {
  const store = load();
  const source = store.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error('Unknown source');
  source.lastSync = new Date().toISOString();
  source.status = 'synced';
  save();
  return source;
}

// ---------- ACL (delegates to access.js) ----------

function canSee(user, node) {
  return access.canSee(user, node);
}

// ---------- reads ----------

function tokens(text) {
  return (
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]+/g) || []
  );
}

function scoreNode(queryTokens, node) {
  const haystack = new Set(
    tokens([node.title, node.content, node.whyItWorked, (node.tags || []).join(' '), node.team].join(' '))
  );
  let score = 0;
  for (const t of queryTokens) if (haystack.has(t)) score += 1;
  if (score === 0) return 0;
  if (node.sourceTier === 'authoritative') score += 2;
  else if (node.sourceTier === 'validated') score += 1;
  if (node.type === 'capability') score += 1;
  score += Math.min(node.heat * 0.15, 2);
  return score;
}

function activeNodes() {
  return load().nodes.filter((n) => !n.supersededBy);
}

function scopedNodes({ user, silo } = {}) {
  const requested = String(silo || '').trim();
  if (requested === access.SILO_DENIED) return [];
  return activeNodes()
    .filter((n) => !user || canSee(user, n))
    .filter((n) => {
      if (!requested || requested === 'all') return true;
      return access.inSilo(n, requested, user);
    });
}

function recall({ query, user, topK = 12, silo } = {}) {
  const q = [...new Set(tokens(query))];
  const store = load();
  const visible = scopedNodes({ user, silo });
  const denied = activeNodes().filter((n) => !canSee(user, n));

  const ranked = visible
    .map((n) => ({ node: n, score: scoreNode(q, n) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const hitIds = new Set(ranked.map((r) => r.node.id));
  const openConflicts = store.conflicts.filter(
    (c) => c.status === 'open' && (hitIds.has(c.nodeA) || hitIds.has(c.nodeB))
  );
  const deniedRelevant = denied.filter((n) => scoreNode(q, n) > 0).length;

  const excluded = store.nodes
    .filter((n) => n.supersededBy && scoreNode(q, n) > 0)
    .map((n) => {
      const winner = store.nodes.find((w) => w.id === n.supersededBy);
      return {
        id: n.id,
        title: n.title,
        layer: n.layer,
        content: n.content,
        supersededBy: n.supersededBy,
        winnerTitle: winner?.title || n.supersededBy,
      };
    });

  return {
    hits: ranked.map((r) => ({ ...r.node, relevance: r.score })),
    conflicts: openConflicts,
    deniedCount: deniedRelevant,
    excluded,
  };
}

function trace(nodeId, maxDepth = 6) {
  const store = load();
  const byId = new Map(store.nodes.map((n) => [n.id, n]));
  const chain = [];
  const seen = new Set();

  function walk(nid, depth) {
    if (!nid || seen.has(nid) || depth > maxDepth) return;
    seen.add(nid);
    const node = byId.get(nid);
    if (!node) return;
    chain.push(node);
    for (const e of store.edges) {
      if (e.from === nid && ['DERIVED_FROM', 'ABOUT', 'SUPERSEDES'].includes(e.type)) {
        walk(e.to, depth + 1);
      }
    }
  }
  walk(nodeId, 0);
  return {
    nodeId,
    chain,
    edges: store.edges.filter((e) => seen.has(e.from) || seen.has(e.to)),
  };
}

function listNodes({ layer, team, query, user } = {}) {
  const q = query ? [...new Set(tokens(query))] : null;
  return scopedNodes({ user, silo: team })
    .filter((n) => !layer || n.layer === layer)
    .filter((n) => !q || scoreNode(q, n) > 0)
    .sort((a, b) => b.heat - a.heat || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getNode(nodeId) {
  return load().nodes.find((n) => n.id === nodeId) || null;
}

function listConflicts(status) {
  return load().conflicts.filter((c) => !status || c.status === status);
}

function listSources() {
  return load().sources;
}

function analytics() {
  const store = load();
  const nodes = store.nodes;
  const active = nodes.filter((n) => !n.supersededBy);

  const byLayer = {};
  for (const n of active) byLayer[n.layer] = (byLayer[n.layer] || 0) + 1;

  const hottest = [...active].sort((a, b) => b.hits - a.hits || b.heat - a.heat).slice(0, 8);
  const coldest = active
    .filter((n) => n.layer === 'memory' && n.hits === 0)
    .slice(0, 8);

  const gaps = store.queries.filter((q) => q.hitCount === 0).slice(-10).reverse();

  // Duplication: capability pairs with heavy token overlap
  const caps = active.filter((n) => n.type === 'capability');
  const duplication = [];
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const a = new Set(tokens(caps[i].title + ' ' + caps[i].content));
      const b = new Set(tokens(caps[j].title + ' ' + caps[j].content));
      const inter = [...a].filter((t) => b.has(t)).length;
      const overlap = inter / Math.min(a.size, b.size);
      if (overlap > 0.45) {
        duplication.push({
          a: { id: caps[i].id, title: caps[i].title, team: caps[i].team },
          b: { id: caps[j].id, title: caps[j].title, team: caps[j].team },
          overlap: Math.round(overlap * 100),
        });
      }
    }
  }

  return {
    totals: {
      nodes: active.length,
      superseded: nodes.length - active.length,
      edges: store.edges.length,
      openConflicts: store.conflicts.filter((c) => c.status === 'open').length,
      capabilities: caps.length,
      queries: store.queries.length,
    },
    byLayer,
    hottest,
    coldest,
    gaps,
    duplication,
  };
}

function listSilos({ user } = {}) {
  return access.listSilos({ user });
}

function graph({ user, silo }) {
  const nodes = scopedNodes({ user, silo });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = load().edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges };
}

function inbox({ user, silo }) {
  const visibleNodes = scopedNodes({ user, silo });
  const nodeById = new Map(visibleNodes.map((n) => [n.id, n]));
  const openConflicts = listConflicts('open')
    .filter((c) => nodeById.has(c.nodeA) || nodeById.has(c.nodeB))
    .map((c) => {
      const a = getNode(c.nodeA);
      const b = getNode(c.nodeB);
      const impact = (Math.max(a?.hits || 0, b?.hits || 0) + 1) * 12;
      return {
        id: c.id,
        type: 'conflict',
        title: c.topic,
        summary: c.summary,
        status: c.status,
        priority: Math.min(100, 40 + impact),
        assigneeTeam: a?.team || b?.team || 'Unknown',
        dueHint: impact > 40 ? 'today' : 'this week',
        refs: [c.nodeA, c.nodeB],
      };
    });

  const staleHighUse = visibleNodes
    .filter((n) => n.hits >= 3 && n.sourceTier === 'community' && n.layer !== 'wisdom')
    .map((n) => ({
      id: `stale_${n.id}`,
      type: 'verification',
      title: `Verify: ${n.title}`,
      summary:
        'High-usage memory still depends on community-grade evidence. Human confirmation recommended.',
      status: 'open',
      priority: Math.min(100, 30 + n.hits * 9),
      assigneeTeam: n.team,
      dueHint: 'this week',
      refs: [n.id],
    }));

  const unresolvedGaps = load().queries
    .filter((q) => q.hitCount === 0)
    .slice(-8)
    .map((q, idx) => ({
      id: `gap_${q.id || idx}`,
      type: 'gap',
      title: `Gap: "${q.query}"`,
      summary: 'People asked this and memory returned no reliable answer.',
      status: 'open',
      priority: 35,
      assigneeTeam: 'Company',
      dueHint: 'backlog',
      refs: [],
      at: q.at,
    }));

  const queue = [...openConflicts, ...staleHighUse, ...unresolvedGaps].sort(
    (a, b) => b.priority - a.priority
  );
  return {
    queue,
    totals: {
      open: queue.length,
      conflicts: openConflicts.length,
      verification: staleHighUse.length,
      gaps: unresolvedGaps.length,
    },
  };
}

module.exports = {
  load,
  save,
  reset,
  addNode,
  addEdge,
  addConflict,
  resolveConflict,
  recordQuery,
  bumpHeat,
  upsertSource,
  syncSource,
  canSee,
  recall,
  trace,
  listNodes,
  getNode,
  listConflicts,
  listSources,
  analytics,
  listSilos,
  graph,
  inbox,
};
