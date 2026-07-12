const store = require('./store');
const { graphViaMcp } = require('./engrammic-mcp');
const { getCachedGraph, setCachedGraph } = require('./graph-cache');

function enrichLocalGraph({ user, silo }) {
  const { nodes, edges } = store.graph({ user, silo });
  return {
    nodes: nodes.map((n) => ({
      ...n,
      summary: n.summary || n.title || String(n.content || '').slice(0, 72),
      title: (n.summary || n.title || 'Untitled').slice(0, 48),
    })),
    edges,
  };
}

function allowDemoFallback() {
  return process.env.AABW_ALLOW_DEMO_FALLBACK === '1' || process.env.AABW_RECALL_LOCAL_ONLY === '1';
}

async function graphUnified({ user, silo, preferMcp = true, bypassCache = false, forLive = false }) {
  if (preferMcp && !bypassCache) {
    const cached = getCachedGraph();
    if (cached && (!forLive || cached.source === 'engrammic-mcp')) return cached;
  }

  if (preferMcp && process.env.AABW_RECALL_LOCAL_ONLY !== '1') {
    const mcp = await graphViaMcp({ topK: 60, bypassCache: true });
    if (mcp.ok) {
      const graph = {
        ...mcp.graph,
        source: 'engrammic-mcp',
        fetchedAt: new Date().toISOString(),
      };
      setCachedGraph(graph);
      return graph;
    }

    if (forLive || !allowDemoFallback()) {
      return {
        nodes: [],
        edges: [],
        source: 'engrammic-mcp',
        mcpError: mcp.error || 'Engrammic MCP unavailable',
        authHint: 'Sign in from Integrations → Connect MCP',
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  if (forLive) {
    return {
      nodes: [],
      edges: [],
      source: 'engrammic-mcp',
      mcpError: 'Live graph requires Engrammic MCP — no demo fallback',
      fetchedAt: new Date().toISOString(),
    };
  }

  const graph = {
    ...enrichLocalGraph({ user, silo }),
    source: 'local-demo',
    mcpError: preferMcp ? 'Engrammic MCP unavailable — demo fallback enabled' : null,
    fetchedAt: new Date().toISOString(),
  };
  setCachedGraph(graph);
  return graph;
}

module.exports = { graphUnified, enrichLocalGraph, allowDemoFallback };
