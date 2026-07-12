const { callMcpTool } = require('./mcp-session');
const access = require('./access');
const { mcpConfig } = require('./mcp-config');

const GENERIC_TITLES = new Set([
  'memory', 'knowledge', 'wisdom', 'claim', 'document', 'commitment',
  'belief', 'meta', 'intelligence', 'untitled', 'node',
]);

function isGenericTitle(text) {
  if (!text) return true;
  const t = String(text).trim().toLowerCase();
  if (GENERIC_TITLES.has(t)) return true;
  if (t.length < 4) return true;
  return false;
}

function contentExcerpt(row, maxLen = 52) {
  const content = row.content || row.text || row.properties?.content || '';
  if (!content || !String(content).trim()) return null;
  const text = String(content).trim().replace(/\s+/g, ' ');
  const sentence = text.match(/^[^.!?\n]{10,140}[.!?]?/)?.[0]?.trim();
  const base = sentence && sentence.length >= 10 ? sentence : text;
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const last = cut.lastIndexOf(' ');
  return `${last > 16 ? cut.slice(0, last) : cut}…`;
}

function metamemoryTitle(row) {
  const summary = row.summary || row.metamemory || row.meta_summary || row.properties?.summary;
  if (summary && String(summary).trim() && !isGenericTitle(summary)) {
    const s = String(summary).trim();
    return s.length > 52 ? `${s.slice(0, 51)}…` : s;
  }
  const excerpt = contentExcerpt(row);
  if (excerpt && !isGenericTitle(excerpt)) return excerpt;
  const tags = (row.tags || row.properties?.tags || []).filter(Boolean);
  if (tags.length) return tags.slice(0, 2).join(' · ');
  const id = row.node_id || row.id;
  if (id) return `·${id.slice(0, 8)}`;
  return 'Untitled';
}

function metamemoryLabel(row) {
  const summary = row.summary || row.metamemory || row.meta_summary || row.properties?.summary;
  if (summary && String(summary).trim()) return String(summary).trim();
  const excerpt = contentExcerpt(row, 120);
  if (excerpt) return excerpt;
  const tags = (row.tags || row.properties?.tags || []).filter(Boolean);
  if (tags.length) return tags.join(', ');
  return metamemoryTitle(row);
}

const { buildContextPack } = require('./context-pack');

function mapResults(query, data) {
  const rows = recallRows(data).filter(isRenderableRow);
  const mcpCautions = [];
  if (data.has_unresolved_conflicts) {
    mcpCautions.push({
      conflictId: 'mcp-unresolved',
      topic: 'Memory conflicts',
      summary: 'Engrammic has unresolved contradictions relevant to this query.',
    });
  }
  if ((data.withheld?.count || 0) > 0) {
    mcpCautions.push({
      conflictId: 'mcp-withheld',
      topic: 'Withheld nodes',
      summary: `${data.withheld.count} low-confidence or contested nodes were withheld.`,
    });
  }

  const hits = rows.map((r) => {
    const layer = normalizeGraphLayer(r);
    const relevance = r.relevance_score ?? r.rrf_score;
    const mcpRationale = [];
    if (relevance != null) mcpRationale.push(`Engrammic fusion (${Number(relevance).toFixed(2)})`);
    if (r.tier) mcpRationale.push(`${r.tier} tier`);
    if (r.retrieval_path) mcpRationale.push(r.retrieval_path);
    if (r.conflict_status) mcpRationale.push(r.conflict_status);
    const isCapability =
      layer === 'knowledge' &&
      ((r.tags || []).includes('capability') || String(r.type || '').toLowerCase() === 'capability');
    return {
      id: r.node_id || r.id,
      title: metamemoryLabel(r),
      summary: metamemoryLabel(r),
      content: r.content || r.summary || '',
      layer,
      type: isCapability ? 'capability' : undefined,
      sourceTier: r.tier || 'validated',
      team: 'Org',
      relevance,
      confidence: r.confidence ?? (r.credibility != null ? r.credibility : null),
      credibility: r.credibility ?? null,
      credibility_factors: r.credibility_factors || null,
      whyItWorked: isCapability ? (r.summary || null) : null,
      tags: r.tags || [],
      mcpRationale: mcpRationale.join(' · ') || null,
    };
  });

  const pack = buildContextPack(query, {
    hits,
    conflicts: [],
    deniedCount: data.withheld?.count || 0,
    excluded: [],
  });

  return {
    ...pack,
    cautions: [...pack.cautions, ...mcpCautions.map((c) => ({ ...c, rationale: c.summary }))],
    source: 'engrammic-mcp',
    mcpMeta: {
      search_mode: data.search_mode || (data.fusion_meta?.enabled ? 'fusion' : null),
      retrieval_quality: data.retrieval_quality,
      search_time_ms: data.search_time_ms,
      fusion: data.fusion_meta || null,
    },
    epistemic_hints: data.epistemic_hints || null,
    engagement: data.engagement || null,
  };
}

function normalizeGraphLayer(row) {
  const raw = String(row.layer || row.type || row.properties?.layer || '').toLowerCase();
  if (raw === 'wisdom' || raw === 'belief' || raw === 'commitment') return 'wisdom';
  if (raw === 'knowledge' || raw === 'claim') return 'knowledge';
  if (raw === 'memory' || raw === 'document' || raw === 'meta' || raw === 'intelligence') return 'memory';
  return 'memory';
}

function recallRows(data) {
  return data?.results || data?.nodes || [];
}

function isRenderableRow(row) {
  const id = row?.node_id || row?.id;
  if (!id) return false;
  const text = row.content || row.summary || row.properties?.summary;
  return Boolean(text && String(text).trim());
}

function mergeRecallRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!isRenderableRow(row)) continue;
    const id = row.node_id || row.id;
    if (!byId.has(id)) byId.set(id, row);
  }
  return [...byId.values()];
}

function linkedNodeIds(rows) {
  const ids = new Set();
  for (const row of rows) {
    for (const id of [
      ...(row.derived_from || []),
      ...(row.supports || []),
      ...(row.about || row.about_ids || []),
      ...(row.contradicts || []),
    ]) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

async function fetchRecallRows(args) {
  const result = await callMcpTool('recall', {
    depth: 0,
    min_threshold: 0,
    include_content: true,
    ...args,
  });
  if (!result.ok) return { ok: false, error: result.error, rows: [], data: null };
  return { ok: true, rows: recallRows(result.data), data: result.data };
}

function normalizeEdge(e) {
  return {
    type: e.type || e.edge_type || e.relationship || 'DERIVED_FROM',
    from: e.from || e.from_node || e.source || e.from_id || e.source_id,
    to: e.to || e.to_node || e.target || e.to_id || e.target_id,
  };
}

function edgesFromRows(rows) {
  const edges = [];
  for (const r of rows) {
    const fromId = r.node_id || r.id;
    for (const src of r.derived_from || r.sources || r.parent_ids || []) {
      edges.push({ type: 'DERIVED_FROM', from: fromId, to: src });
    }
    for (const src of r.supports || []) {
      edges.push({ type: 'SUPPORTS', from: src, to: fromId });
    }
    for (const aboutId of r.about || r.about_ids || []) {
      edges.push({ type: 'ABOUT', from: fromId, to: aboutId });
    }
    for (const id of r.evidence_used || r.evidence_nodes || []) {
      edges.push({ type: 'SUPPORTS', from: id, to: fromId });
    }
    for (const edge of r.edges || []) {
      edges.push(normalizeEdge(edge));
    }
  }
  return edges;
}

const SUN_KEYS = new Set(['company', 'org', 'all']);

function inferTeam(row) {
  const explicit = row.team || row.properties?.team;
  if (explicit && !SUN_KEYS.has(String(explicit).toLowerCase())) return explicit;
  const text = [
    row.content,
    row.summary,
    row.properties?.summary,
    ...(row.tags || []),
    ...(row.properties?.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hints = [
    ["Engineering", ["engineering", "engineer", "architecture", "api", "codebase", "deploy"]],
    ["Finance", ["finance", "expense", "invoice", "budget", "accounting", "ocr"]],
    ["Human Resources", ["human resources", "onboarding", "leave", "hiring", " hr "]],
    ["Product", ["product", "roadmap", "release", "feature", "ux"]],
    ["Operations", ["operations", "incident", "postmortem", " ops "]],
    ["Executive", ["executive", "board", "strategy", "company-wide"]],
  ];
  for (const [team, keys] of hints) {
    if (keys.some((k) => text.includes(k))) return team;
  }
  return "Company";
}

function mapGraphData(data) {
  const rows = (data.results || []).filter((r) => r.node_id || r.id);
  const nodeIds = new Set(rows.map((r) => r.node_id || r.id));

  const nodes = rows.map((r) => ({
    id: r.node_id || r.id,
    layer: normalizeGraphLayer(r),
    summary: metamemoryLabel(r),
    title: metamemoryTitle(r),
    content: r.content || r.summary || r.properties?.summary || '',
    tags: r.tags || r.properties?.tags || [],
    team: inferTeam(r),
    sourceTier: r.tier || r.properties?.tier || 'validated',
  }));

  const rawEdges = [
    ...(data.edges || []),
    ...(data.graph_edges || []),
    ...edgesFromRows(rows),
  ].map(normalizeEdge);

  const edges = [];
  const seen = new Set();
  for (const e of rawEdges) {
    if (!e.from || !e.to || !nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const key = `${e.type}:${e.from}:${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(e);
  }

  return { nodes, edges };
}

async function enrichGraphEdges(graph) {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edges = [...graph.edges];
  const seen = new Set(edges.map((e) => `${e.type}:${e.from}:${e.to}`));
  const pendingIds = new Set();

  const pushEdge = (from, to, type = 'SYNTHESIZED_FROM') => {
    if (!from || !to || from === to) return;
    const key = `${type}:${from}:${to}`;
    if (seen.has(key)) return;
    if (!nodeIds.has(from) || !nodeIds.has(to)) return;
    seen.add(key);
    edges.push({ type, from, to });
  };

  const queueNode = (row) => {
    const id = row?.node_id || row?.id;
    if (!id || nodeIds.has(id)) return id;
    pendingIds.add(id);
    nodeIds.add(id);
    graph.nodes.push({
      id,
      layer: normalizeGraphLayer(row),
      summary: metamemoryLabel(row),
      title: metamemoryTitle(row),
      content: row.content || row.summary || '',
      tags: row.tags || [],
      team: inferTeam(row),
      sourceTier: row.tier || 'validated',
    });
    return id;
  };

  const traceTargets = [
    ...graph.nodes
      .filter((n) => n.layer === 'wisdom')
      .map((n) => ({ node: n, direction: 'down', edge_types: ['SYNTHESIZED_FROM', 'DERIVED_FROM'] })),
    ...graph.nodes
      .filter((n) => n.layer === 'knowledge')
      .slice(0, 18)
      .map((n) => ({ node: n, direction: 'up', edge_types: ['DERIVED_FROM'] })),
  ];

  const BATCH = 4;
  for (let i = 0; i < traceTargets.length; i += BATCH) {
    const batch = traceTargets.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map(async ({ node, direction, edge_types }) => {
      let trace = await callMcpTool('trace', {
        node_id: node.id,
        direction,
        max_depth: 3,
        edge_types,
      });
      if ((!trace.ok || !(trace.data?.chain || []).length) && node.layer === 'wisdom') {
        trace = await callMcpTool('trace', {
          node_id: node.id,
          direction: 'up',
          max_depth: 3,
          edge_types: ['DERIVED_FROM', 'SYNTHESIZED_FROM'],
        });
      }
      if (!trace.ok || !trace.data) return;

      const chain = trace.data.chain || trace.data.nodes || [];
      for (const row of chain) {
        const id = queueNode(row);
        if (!id) continue;
        if (node.layer === 'wisdom') pushEdge(id, node.id, 'SYNTHESIZED_FROM');
        else pushEdge(node.id, id, 'DERIVED_FROM');
      }

      for (const edge of trace.data.edges || []) {
        const normalized = normalizeEdge(edge);
        pushEdge(normalized.from, normalized.to, normalized.type);
      }
    }));
  }

  if (pendingIds.size) {
    const fetched = await fetchRecallRows({ node_ids: [...pendingIds].slice(0, 120) });
    if (fetched.ok) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      for (const row of fetched.rows) {
        const id = row.node_id || row.id;
        const existing = byId.get(id);
        if (!existing) continue;
        existing.summary = metamemoryLabel(row);
        existing.title = metamemoryTitle(row);
        existing.content = row.content || row.summary || existing.content;
        existing.tags = row.tags || row.properties?.tags || existing.tags;
        existing.layer = normalizeGraphLayer(row);
      }
    }
  }

  const hasMemoryNeighbor = (nodeId) => {
    for (const e of edges) {
      const other = e.from === nodeId ? e.to : e.to === nodeId ? e.from : null;
      if (!other) continue;
      const n = graph.nodes.find((x) => x.id === other);
      if (n?.layer === 'memory') return true;
    }
    return false;
  };

  const orphanWisdom = graph.nodes.filter((n) => n.layer === 'wisdom' && !hasMemoryNeighbor(n.id));
  for (let i = 0; i < orphanWisdom.length; i += 3) {
    const batch = orphanWisdom.slice(i, i + 3);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map(async (node) => {
      const hood = await recallNeighborhood(node.id, 2);
      if (!hood.ok) return;
      for (const row of hood.rows) queueNode(row);
      for (const e of hood.edges) pushEdge(e.from, e.to, e.type);
    }));
  }

  return { nodes: graph.nodes, edges };
}

async function recallViaMcp(query, { topK = 10 } = {}) {
  const result = await callMcpTool('recall', {
    query,
    top_k: topK,
    fusion_mode: true,
    depth: 0,
    min_threshold: 0,
    include_content: true,
  });
  if (!result.ok) return result;
  const rows = recallRows(result.data).filter(isRenderableRow);
  if (!rows.length) {
    return { ok: true, pack: mapResults(query, result.data), raw: result.data };
  }
  return { ok: true, pack: mapResults(query, result.data), raw: result.data };
}

function mapChainRow(row) {
  return {
    id: row.node_id || row.id,
    layer: normalizeGraphLayer(row),
    title: metamemoryTitle(row),
    summary: metamemoryLabel(row),
    content: row.content || row.summary || '',
    sourceTier: row.tier || 'validated',
    confidence: row.confidence ?? row.credibility ?? null,
    credibility: row.credibility ?? null,
    tags: row.tags || [],
  };
}

function dedupeChainRows(rows, startId) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = row.id || row.node_id;
    if (!id || id === startId || seen.has(id)) continue;
    seen.add(id);
    out.push(row.id ? row : mapChainRow(row));
  }
  return out;
}

async function recallNeighborhood(nodeId, depth = 2) {
  let best = null;
  for (const d of [Math.min(depth, 1), depth].filter((v, i, a) => a.indexOf(v) === i)) {
    const recall = await fetchRecallRows({
      node_ids: [nodeId],
      depth: d,
      top_k: 48,
      include_content: true,
    });
    if (!recall.ok) continue;
    const rows = recallRows(recall.data);
    const edges = [
      ...(recall.data?.edges || []),
      ...(recall.data?.graph_edges || []),
      ...edgesFromRows(rows),
    ]
      .map(normalizeEdge)
      .filter((e) => e.from && e.to && e.from !== e.to);
    if (!best || rows.length > best.rows.length || edges.length > best.edges.length) {
      best = { ok: true, rows, edges, data: recall.data };
    }
    if (rows.length > 1 && edges.length) break;
  }
  return best || { ok: false, error: 'No neighborhood returned' };
}

function provenanceChainFromRecall(nodeId, rows, edges) {
  const byId = new Map(rows.map((r) => [r.node_id || r.id, r]));
  const layerRank = { memory: 0, knowledge: 1, wisdom: 2 };
  const seen = new Set([nodeId]);
  const chain = [];
  const queue = [nodeId];

  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges) {
      let next = null;
      if (e.from === cur) next = e.to;
      else if (e.to === cur) next = e.from;
      if (!next || seen.has(next)) continue;
      const row = byId.get(next);
      if (!row) continue;
      seen.add(next);
      chain.push(mapChainRow(row));
      queue.push(next);
    }
  }

  chain.sort((a, b) => (layerRank[a.layer] ?? 9) - (layerRank[b.layer] ?? 9));
  return chain;
}

async function traceViaMcp(nodeId) {
  const attempts = [
    { direction: 'down', edge_types: ['DERIVED_FROM', 'SYNTHESIZED_FROM', 'SUPPORTS'] },
    { direction: 'up', edge_types: ['DERIVED_FROM', 'SYNTHESIZED_FROM', 'SUPPORTS'] },
    { direction: 'both', edge_types: ['DERIVED_FROM', 'SYNTHESIZED_FROM', 'SUPPORTS', 'ABOUT'] },
  ];

  let bestChain = [];
  let bestEdges = [];
  let focusNode = null;

  for (const spec of attempts) {
    const trace = await callMcpTool('trace', { node_id: nodeId, ...spec, max_depth: 6 });
    if (!trace.ok) continue;
    const chain = trace.data?.chain || trace.data?.nodes || [];
    if (chain.length > bestChain.length) {
      bestChain = chain;
      bestEdges = trace.data?.edges || [];
      focusNode = chain.find((r) => (r.node_id || r.id) === nodeId) || chain[0];
    }
    if (bestChain.length > 1) break;
  }

  let rows = bestChain;
  let edges = bestEdges.map(normalizeEdge);
  let orphan = false;

  if (bestChain.length <= 1) {
    const hood = await recallNeighborhood(nodeId, 2);
    if (hood.ok && hood.rows.length) {
      rows = hood.rows;
      edges = hood.edges;
      focusNode = rows.find((r) => (r.node_id || r.id) === nodeId) || rows[0];
      orphan = !provenanceChainFromRecall(nodeId, rows, edges).some((n) => n.layer === 'memory');
    } else {
      const solo = await fetchRecallRows({ node_ids: [nodeId], depth: 0, include_content: true });
      if (!solo.ok || !solo.rows.length) {
        return { ok: false, error: hood.error || solo.error || 'No trace chain returned' };
      }
      focusNode = solo.rows.find((r) => (r.node_id || r.id) === nodeId) || solo.rows[0];
      rows = solo.rows;
      edges = [];
      orphan = true;
    }
  }

  const node = mapChainRow(focusNode || rows[0]);
  let mappedChain = bestChain.length > 1
    ? dedupeChainRows(bestChain.map(mapChainRow), nodeId)
    : provenanceChainFromRecall(nodeId, rows, edges);
  if (!mappedChain.length && rows.length > 1) {
    mappedChain = provenanceChainFromRecall(nodeId, rows, edges);
  }

  return {
    ok: true,
    node,
    trace: { chain: mappedChain, edges },
    source: 'engrammic-mcp',
    orphan,
  };
}

async function graphViaMcp({ topK = 60, bypassCache = false } = {}) {
  const probes = [
    { query: 'memories observations notes context', layers: ['memory'], top_k: topK },
    { query: 'claims facts knowledge evidence', layers: ['knowledge'], top_k: topK },
    { query: 'beliefs commitments wisdom synthesis', layers: ['wisdom'], top_k: topK },
    { query: 'project organization architecture decisions', top_k: topK },
  ];

  const batches = await Promise.all(
    probes.map((probe) => fetchRecallRows({
      ...probe,
      bypass_cache: bypassCache,
    })),
  );

  const errors = batches.filter((b) => !b.ok).map((b) => b.error);
  let rows = mergeRecallRows(batches.flatMap((b) => b.rows));

  if (!rows.length) {
    const fallback = await fetchRecallRows({
      query: 'memory knowledge wisdom organization project',
      top_k: Math.max(topK, 80),
      bypass_cache: bypassCache,
    });
    if (fallback.ok) rows = mergeRecallRows(fallback.rows);
    if (!rows.length) {
      return { ok: false, error: errors[0] || fallback.error || 'No nodes returned from Engrammic' };
    }
  }

  const known = new Set(rows.map((r) => r.node_id || r.id));
  const missing = [...linkedNodeIds(rows)].filter((id) => !known.has(id)).slice(0, 100);
  if (missing.length) {
    const linked = await fetchRecallRows({ node_ids: missing });
    if (linked.ok) rows = mergeRecallRows([...rows, ...linked.rows]);
  }

  const payload = {
    results: rows,
    edges: [
      ...batches.flatMap((b) => b.data?.edges || []),
      ...batches.flatMap((b) => b.data?.graph_edges || []),
      ...edgesFromRows(rows),
    ],
    graph_edges: batches.flatMap((b) => b.data?.graph_edges || []),
  };

  let graph = mapGraphData(payload);
  graph = await enrichGraphEdges(graph);
  return { ok: true, graph };
}

function ingestTags(source, harness, extra = []) {
  const tags = ['ingested', 'engineering', 'aabw', String(source || 'ingest').toLowerCase(), String(harness || 'ingest').toLowerCase(), ...extra]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().replace(/\s+/g, '-'));
  return [...new Set(tags)].slice(0, 8);
}

async function ingestViaMcp({
  title,
  claim,
  observation,
  tags: extraTags = [],
  sourceUri,
  source,
  team,
  scope = 'team',
  ownerId,
  user,
  harness = 'ingest',
}) {
  const tags = ingestTags(source, harness, [
    ...extraTags,
    ...access.scopeTags(scope, ownerId || user?.userId),
    slugTeam(team),
  ]);

  const remember = await callMcpTool('remember', {
    content: [title, observation, sourceUri ? `Source: ${sourceUri}` : null].filter(Boolean).join('\n\n'),
    tags,
    decay: 'durable',
  });

  if (!remember.ok) return remember;

  const memoryId = remember.data?.node_id;
  if (!memoryId) {
    return { ok: false, error: 'Remember succeeded but no node_id returned' };
  }

  const claimText = claim || title;
  const learn = await callMcpTool('learn', {
    claim: claimText,
    evidence: [`node:${memoryId}`],
    source: 'user',
    confidence: 0.82,
    tags,
    source_tier: source === 'slack' ? 'community' : 'validated',
  });

  if (!learn.ok || learn.data?.error) {
    return {
      ok: true,
      partial: true,
      memory: remember.data,
      error: learn.error || learn.data?.error || learn.data?.reason || 'Learn failed after remember',
    };
  }

  return {
    ok: true,
    memory: remember.data,
    claimNode: {
      id: learn.data.node_id,
      layer: learn.data.layer || 'knowledge',
      evidenceNodes: learn.data.evidence_nodes || [memoryId],
    },
    trace: {
      memoryId,
      claimId: learn.data.node_id,
    },
    extracted: { title, claim: claimText },
  };
}

/** @deprecated use ingestViaMcp — kept for hook compat */
async function captureViaMcp(body) {
  return ingestViaMcp({
    title: body.title,
    claim: body.content,
    observation: [body.title, body.content, body.whyItWorked].filter(Boolean).join('\n\n'),
    sourceUri: body.sourceUri,
    source: body.source || 'capture',
    team: body.team,
    user: body.user,
    harness: body.harness,
  });
}

function captureTags(team, harness, extra = []) {
  return ingestTags('capture', harness, [slugTeam(team), ...extra]);
}

function slugTeam(team) {
  return String(team || 'Company')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

module.exports = {
  recallViaMcp,
  traceViaMcp,
  graphViaMcp,
  ingestViaMcp,
  captureViaMcp,
  mapResults,
  mapGraphData,
  metamemoryLabel,
  metamemoryTitle,
};
