const store = require('./store');
const { captureViaMcp } = require('./engrammic-mcp');
const { invalidateGraphCache } = require('./graph-cache');
const { mcpConfig } = require('./mcp-config');

function slugTeam(team) {
  return String(team || 'Company')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function captureLocal({ title, content, whyItWorked, team, user }) {
  const claim = store.addNode({
    layer: 'knowledge',
    type: 'claim',
    title,
    content,
    team,
    classification: 'internal',
    sourceTier: 'user-captured',
    tags: ['captured'],
    owner: user.userId,
  });
  let capability = null;
  if (whyItWorked) {
    capability = store.addNode({
      layer: 'knowledge',
      type: 'capability',
      title,
      content,
      whyItWorked,
      team,
      classification: 'internal',
      sourceTier: 'user-captured',
      tags: ['capability', 'captured'],
      owner: user.userId,
    });
    store.addEdge('DERIVED_FROM', capability.id, claim.id);
  }
  return { ok: true, claim, capability, source: 'local-demo' };
}

async function captureUnified(body, user, team) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const whyItWorked = String(body.whyItWorked || '').trim();
  const sourceUri = String(body.sourceUri || body.source || '').trim();
  const harness = String(body.harness || 'web').trim();

  if (!title || !content) {
    return { ok: false, error: 'Missing title or content' };
  }

  const preferMcp = process.env.AABW_RECALL_LOCAL_ONLY !== '1' && Boolean(mcpConfig().token);

  if (preferMcp) {
    const mcp = await captureViaMcp({
      title,
      content,
      whyItWorked,
      team,
      user,
      sourceUri,
      harness,
    });
    if (mcp.ok) {
      invalidateGraphCache();
      return {
        ok: true,
        source: 'engrammic-mcp',
        memory: mcp.memory,
        claim: mcp.claimNode,
        capability: mcp.capabilityNode,
        trace: mcp.trace,
        partial: Boolean(mcp.partial),
        mcpError: mcp.partial ? mcp.error : null,
      };
    }
    if (process.env.AABW_ALLOW_DEMO_FALLBACK === '1') {
      const local = captureLocal({ title, content, whyItWorked, team, user });
      invalidateGraphCache();
      return { ...local, mcpError: mcp.error };
    }
    return { ok: false, error: mcp.error || 'Engrammic capture failed' };
  }

  const local = captureLocal({ title, content, whyItWorked, team, user });
  invalidateGraphCache();
  return local;
}

module.exports = { captureUnified, captureLocal, slugTeam };
