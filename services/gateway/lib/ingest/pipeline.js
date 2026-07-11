const { extractKnowledge } = require('./extract');
const { ingestViaMcp } = require('../engrammic-mcp');
const { invalidateGraphCache } = require('../graph-cache');
const { mcpConfig } = require('../mcp-config');
const store = require('../store');
const { markIngested } = require('../connectors/state');

/**
 * Auto-ingest: remember observation → learn extracted claim (no manual fields).
 */
async function ingestAuto({
  title,
  claim,
  observation,
  tags = [],
  sourceUri,
  source,
  team,
  user,
  harness = 'ingest',
}) {
  const preferMcp = process.env.AABW_RECALL_LOCAL_ONLY !== '1' && Boolean(mcpConfig().token);

  if (preferMcp) {
    const result = await ingestViaMcp({
      title,
      claim,
      observation,
      tags,
      sourceUri,
      source,
      team,
      user,
      harness,
    });
    if (result.ok) {
      invalidateGraphCache();
      return { ok: true, source: 'engrammic-mcp', ...result };
    }
    if (process.env.AABW_ALLOW_DEMO_FALLBACK !== '1') {
      return { ok: false, error: result.error || 'Engrammic ingest failed' };
    }
  }

  const local = ingestLocal({ title, claim: claim || title, observation, sourceUri, team, user });
  invalidateGraphCache();
  return { ok: true, source: 'local-demo', ...local, mcpError: preferMcp ? 'MCP unavailable' : null };
}

function ingestLocal({ title, claim, observation, sourceUri, team, user }) {
  const mem = store.addNode({
    layer: 'memory',
    type: 'observation',
    title,
    content: observation,
    team,
    classification: 'internal',
    sourceUri,
    sourceTier: sourceUri?.startsWith('slack://') ? 'community' : 'validated',
    tags: ['ingested', 'engineering'],
    owner: user?.userId,
  });
  const kn = store.addNode({
    layer: 'knowledge',
    type: 'claim',
    title,
    content: claim,
    team,
    classification: 'internal',
    sourceUri,
    sourceTier: mem.sourceTier,
    tags: ['ingested', 'engineering', 'auto-extracted'],
    owner: user?.userId,
  });
  store.addEdge('DERIVED_FROM', kn.id, mem.id);
  return {
    trace: { memoryId: mem.id, claimId: kn.id },
    memory: { node_id: mem.id },
    claimNode: { id: kn.id },
  };
}

/** Manual doc paste — engineers paste runbooks, ADRs, notes; knowledge auto-extracted. */
async function ingestDocument({ text, label, sourceUri, user, team }) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'Empty document' };

  const extracted = extractKnowledge(body, {
    source: 'document',
    title: label || 'Engineering document',
  });
  if (!extracted) return { ok: false, error: 'Could not extract content' };

  const uri = sourceUri || `doc://manual/${Date.now()}`;
  const result = await ingestAuto({
    ...extracted,
    sourceUri: uri,
    source: 'document',
    team: team || user?.department || 'Engineering',
    user,
    harness: 'document',
  });

  if (result.ok) markIngested(uri, result.trace?.memoryId || result.trace?.claimId);
  return result;
}

module.exports = { ingestAuto, ingestDocument, ingestLocal };
