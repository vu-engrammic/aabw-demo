const store = require('./store');
const access = require('./access');
const { buildContextPack } = require('./context-pack');
const { recallViaMcp } = require('./engrammic-mcp');
const { mcpConfig } = require('./mcp-config');

function allowDemoFallback() {
  return process.env.AABW_ALLOW_DEMO_FALLBACK === '1' || process.env.AABW_RECALL_LOCAL_ONLY === '1';
}

async function recallUnified({
  query,
  user,
  topK = 12,
  preferMcp = true,
  forLive = false,
  silo,
  fusionMode,
  asOf,
} = {}) {
  let mcpFailure = null;
  const effectiveSilo = silo || null;

  if (preferMcp && process.env.AABW_RECALL_LOCAL_ONLY !== '1') {
    const mcp = await recallViaMcp(query, { topK, fusionMode, asOf });
    if (mcp.ok) {
      const pack = access.filterContextPack(mcp.pack, user, effectiveSilo);
      return { pack, source: 'engrammic-mcp', mcpError: null };
    }
    mcpFailure = mcp.error || 'Engrammic recall failed';
    const { token } = mcpConfig();
    if (token && (forLive || !allowDemoFallback())) {
      return {
        pack: {
          ...buildContextPack(query, { hits: [], conflicts: [], deniedCount: 0, excluded: [] }),
          source: 'engrammic-mcp',
        },
        source: 'engrammic-mcp',
        mcpError: mcpFailure,
      };
    }
  }

  if (forLive) {
    return {
      pack: {
        ...buildContextPack(query, { hits: [], conflicts: [], deniedCount: 0, excluded: [] }),
        source: 'engrammic-mcp',
      },
      source: 'engrammic-mcp',
      mcpError: mcpFailure || 'Live recall requires Engrammic MCP — no demo fallback',
    };
  }

  const result = store.recall({ query, user, topK, silo: effectiveSilo });
  return {
    pack: { ...buildContextPack(query, result), source: 'local-demo' },
    source: 'local-demo',
    mcpError: preferMcp
      ? mcpFailure || 'Engrammic MCP unavailable — using local demo store'
      : null,
  };
}

module.exports = { recallUnified, allowDemoFallback };
